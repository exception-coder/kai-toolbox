package com.exceptioncoder.toolbox.visitoranalysis.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 绑定 {@code toolbox.visitor-analysis.customer-sync.*}：从 Yoooni 同步客户底库到本地 {@code va_customer_ref}，
 * 供本地精准去重判定 + 向量召回。默认 {@link #enabled}=false。
 *
 * <p>标 {@link Refreshable} 纳入配置中心：base-url/token/超时在线改即生效（实时手机查也用同一连接）；
 * cron 启动固化、改后重启重排。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.visitor-analysis.customer-sync")
@Refreshable(name = "客户底库同步")
public class CustomerSyncProperties {

    @ConfigDesc("总开关：开启后才定时同步 Yoooni 客户底库到本地；关闭则不同步、实时手机查也不调用")
    private boolean enabled = false;

    @ConfigDesc("Yoooni ERP 根地址（不含路径，如 http://localhost:8080），用于同步客户与实时手机查")
    private String baseUrl = "http://localhost:8080";

    @ConfigDesc("调 Yoooni 客户接口的鉴权令牌（请求头 X-AI-Token），须与 Yoooni 侧一致")
    private String token = "yoooni-ai-agent-token-2026";

    @ConfigDesc("全量同步定时表达式（Spring cron，默认每天 02:30）；调度启动固化，改后需重启")
    private String fullCron = "0 30 2 * * *";

    @ConfigDesc("增量同步定时表达式（Spring cron，默认每 30 分钟，按客户最后修改时间水位拉变更）；改后需重启")
    private String incrCron = "0 */30 * * * *";

    @ConfigDesc("单页拉取的最大客户条数（全量分页/增量批量上限）")
    private int batchLimit = 500;

    @ConfigDesc("调 Yoooni 的连接超时（毫秒）")
    private int connectTimeoutMs = 5000;

    @ConfigDesc("调 Yoooni 的读取超时（毫秒）")
    private int readTimeoutMs = 30000;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) {
        this.baseUrl = (baseUrl == null) ? null : baseUrl.replaceAll("/+$", "");
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public String getFullCron() { return fullCron; }
    public void setFullCron(String fullCron) { this.fullCron = fullCron; }

    public String getIncrCron() { return incrCron; }
    public void setIncrCron(String incrCron) { this.incrCron = incrCron; }

    public int getBatchLimit() { return batchLimit; }
    public void setBatchLimit(int batchLimit) { this.batchLimit = Math.max(1, batchLimit); }

    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }

    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }
}
