package com.exceptioncoder.toolbox.visitoranalysis.client;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustomerSyncRecord;
import com.exceptioncoder.toolbox.visitoranalysis.config.CustomerSyncProperties;
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
 * Yoooni 客户底库同步客户端：调 {@code cust_aiSyncCustomers.action}（token 鉴权）拉取客户必要判定数据。
 * 判定一律走 agent 本地 SQL，不做实时回查。RestClient 带超时，配置变更重建。
 */
@Component
public class YoooniCustomerClient {

    private static final Logger log = LoggerFactory.getLogger(YoooniCustomerClient.class);
    private static final String SYNC_PATH = "/cust/cust_aiSyncCustomers.action";
    private static final String PREFIX = "toolbox.visitor-analysis.customer-sync";

    private final CustomerSyncProperties props;
    private volatile RestClient rest;

    public YoooniCustomerClient(CustomerSyncProperties props) {
        this.props = props;
        this.rest = build();
    }

    private RestClient build() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(props.getConnectTimeoutMs());
        f.setReadTimeout(props.getReadTimeoutMs());
        return RestClient.builder().requestFactory(f).build();
    }

    @EventListener(EnvironmentChangeEvent.class)
    public void onConfigChange(EnvironmentChangeEvent event) {
        if (event.getKeys().stream().anyMatch(k -> k.startsWith(PREFIX))) {
            this.rest = build();
            log.info("[customer-sync] 配置变更，Yoooni 客户同步客户端已重建（base-url={}）", props.getBaseUrl());
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record SyncResp(String code, List<CustomerSyncRecord> body, String msg) {
    }

    /** 拉取客户底库。sinceDate 为空 = 全量；非空 = 增量（lastdate >= sinceDate）。 */
    public List<CustomerSyncRecord> fetchCustomers(String sinceDate) throws IOException {
        String url = props.getBaseUrl() + SYNC_PATH
                + (sinceDate == null || sinceDate.isBlank() ? "" : "?sinceDate=" + sinceDate);
        try {
            SyncResp resp = rest.get().uri(url).header("X-AI-Token", props.getToken())
                    .retrieve().body(SyncResp.class);
            if (resp == null) throw new IOException("客户同步：响应体为空 url=" + url);
            if (!"200".equals(resp.code())) throw new IOException("客户同步：业务码=" + resp.code() + " msg=" + resp.msg());
            return resp.body() == null ? List.of() : resp.body();
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("客户同步失败 url=" + url + " : " + e.getMessage(), e);
        }
    }
}
