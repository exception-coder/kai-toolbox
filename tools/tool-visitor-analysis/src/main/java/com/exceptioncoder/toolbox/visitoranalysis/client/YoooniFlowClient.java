package com.exceptioncoder.toolbox.visitoranalysis.client;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustAddAuditRecord;
import com.exceptioncoder.toolbox.visitoranalysis.config.CustAddAuditSyncProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.List;

/**
 * Yoooni ERP 流程审批拉取客户端。调 {@code GET /flow/flowcheck_aiSyncCustAddAudit.action}
 * 拉取未审批的「客户新增审批」记录：注入 {@code X-AI-Token} 头 + {@code sinceDate} 水位线。
 *
 * <p>RestClient 带连接/读取超时，避免调度线程被慢响应拖住。
 * 接口约定返回 {@code {code, body[], msg}}；{@code code != "200"} 或 HTTP 异常一律抛 IOException，
 * 由上层据此放弃本轮水位推进。
 */
@Component
public class YoooniFlowClient {

    private static final Logger log = LoggerFactory.getLogger(YoooniFlowClient.class);
    private static final String SYNC_PATH = "/flow/flowcheck_aiSyncCustAddAudit.action";
    private static final String PREFIX = "toolbox.visitor-analysis.cust-add-audit-sync";

    private final CustAddAuditSyncProperties props;
    /** 超时固化在 RestClient 内，配置中心改超时后由 onConfigChange 重建。volatile 保证 fetch 线程可见新实例。 */
    private volatile RestClient rest;

    public YoooniFlowClient(CustAddAuditSyncProperties props) {
        this.props = props;
        this.rest = build();
    }

    private RestClient build() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.getConnectTimeoutMs());
        factory.setReadTimeout(props.getReadTimeoutMs());
        return RestClient.builder().requestFactory(factory).build();
    }

    /** 配置中心改了本模块的超时（或其它键）后重建 RestClient；base-url/token 在 fetch 时实时读取无需重建。 */
    @EventListener(EnvironmentChangeEvent.class)
    public void onConfigChange(EnvironmentChangeEvent event) {
        if (event.getKeys().stream().anyMatch(k -> k.startsWith(PREFIX))) {
            this.rest = build();
            log.info("[cust-add-audit] 同步配置变更，Yoooni 拉取客户端已重建（base-url={}）", props.getBaseUrl());
        }
    }

    /** Yoooni 接口统一响应包：{@code {code, body[], msg}}。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Resp(String code, List<CustAddAuditRecord> body, String msg) {
    }

    /**
     * 拉取 {@code applymakedate >= sinceDate} 的未审批客户新增记录。
     *
     * @param sinceDate 水位线 yyyy-MM-dd
     * @return 记录列表（可能为空）
     * @throws IOException 网络异常 / 鉴权失败 / 业务码非 200
     */
    public List<CustAddAuditRecord> fetch(String sinceDate) throws IOException {
        String url = props.getBaseUrl() + SYNC_PATH + "?sinceDate=" + sinceDate;
        try {
            Resp resp = rest.get()
                    .uri(url)
                    .header("X-AI-Token", props.getToken())
                    .retrieve()
                    .body(Resp.class);
            if (resp == null) {
                throw new IOException("拉取客户新增审批：响应体为空 url=" + url);
            }
            if (!"200".equals(resp.code())) {
                throw new IOException("拉取客户新增审批：业务码=" + resp.code() + " msg=" + resp.msg());
            }
            List<CustAddAuditRecord> body = resp.body() == null ? List.of() : resp.body();
            log.debug("[cust-add-audit] 拉取 sinceDate={} 命中 {} 条", sinceDate, body.size());
            return body;
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            // RestClient 的 HTTP/连接异常归一为 IOException，交上层放弃本轮
            throw new IOException("拉取客户新增审批失败 url=" + url + " : " + e.getMessage(), e);
        }
    }
}
