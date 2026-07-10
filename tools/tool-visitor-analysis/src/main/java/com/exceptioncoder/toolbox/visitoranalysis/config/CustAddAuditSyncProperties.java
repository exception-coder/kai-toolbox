package com.exceptioncoder.toolbox.visitoranalysis.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 绑定 {@code toolbox.visitor-analysis.cust-add-audit-sync.*}。
 *
 * <p>从 Yoooni ERP 定时拉取「客户新增审批」记录并异步判别的同步开关与参数。
 * 默认 {@link #enabled}=false——本机未配 Yoooni 地址时定时任务不空转报错；配好 base-url/token 后置 true。
 *
 * <p>标 {@link Refreshable} 纳入运行时动态配置中心：{@code base-url}/{@code token}/{@code default-since-date}/
 * {@code batch-limit}/超时均可在线改、不重启生效（SQLite 覆盖 + EnvironmentChangeEvent rebind）。
 * {@code base-url}/{@code token} 由 {@code YoooniFlowClient.fetch} 每次调用实时读取，立即生效；超时变更由
 * {@code YoooniFlowClient} 监听 {@code EnvironmentChangeEvent} 重建连接生效。
 * {@code pull-cron}/{@code analyze-cron} 在启动时固化到调度器，改后需重启才重排。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.visitor-analysis.cust-add-audit-sync")
@Refreshable(name = "客户新增审批同步", group = "访客分析")
public class CustAddAuditSyncProperties {

    /** 总开关。false 时拉取/判别定时任务直接跳过。 */
    @ConfigDesc("总开关：开启后才定时拉取并判别客户新增审批；关闭则拉取/判别两段定时任务都跳过")
    private boolean enabled = false;

    /** Yoooni ERP 根地址（不含路径），如 {@code http://localhost:8080}。 */
    @ConfigDesc("Yoooni ERP 根地址（不含路径，如 http://localhost:8080），用于拉取未审批的客户新增审批记录")
    private String baseUrl = "http://localhost:8080";

    /** 拉取接口鉴权头 {@code X-AI-Token} 的值，须与 Yoooni 侧一致。 */
    @ConfigDesc("调 Yoooni 拉取接口的鉴权令牌（请求头 X-AI-Token），须与 Yoooni 侧配置一致")
    private String token = "yoooni-ai-agent-token-2026";

    /** 首轮 / 空表时的水位线（yyyy-MM-dd）。 */
    @ConfigDesc("首轮/空表时的起始水位线（yyyy-MM-dd）；之后自动按已拉取记录的最大日期向前推进")
    private String defaultSinceDate = "2026-06-01";

    /** 拉取登记定时表达式（默认每 10 分钟）。 */
    @ConfigDesc("拉取登记定时表达式（Spring cron，默认每 10 分钟）；调度在启动时固化，改后需重启才重排")
    private String pullCron = "0 */10 * * * *";

    /** 异步判别定时表达式（默认每 2 分钟）。 */
    @ConfigDesc("异步判别定时表达式（Spring cron，默认每 2 分钟）；调度在启动时固化，改后需重启才重排")
    private String analyzeCron = "0 */2 * * * *";

    /** 单轮判别处理的记录条数上限。 */
    @ConfigDesc("单轮异步判别处理的最大记录条数（防止一次判别过多拖垮）")
    private int batchLimit = 50;

    /** HTTP 连接超时（毫秒）。 */
    @ConfigDesc("调 Yoooni 的连接超时（毫秒）")
    private int connectTimeoutMs = 5000;

    /** HTTP 读取超时（毫秒）。 */
    @ConfigDesc("调 Yoooni 的读取超时（毫秒）")
    private int readTimeoutMs = 15000;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) {
        // 去掉末尾斜杠，拼接路径时统一不带尾斜杠
        this.baseUrl = (baseUrl == null) ? null : baseUrl.replaceAll("/+$", "");
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public String getDefaultSinceDate() { return defaultSinceDate; }
    public void setDefaultSinceDate(String defaultSinceDate) { this.defaultSinceDate = defaultSinceDate; }

    public String getPullCron() { return pullCron; }
    public void setPullCron(String pullCron) { this.pullCron = pullCron; }

    public String getAnalyzeCron() { return analyzeCron; }
    public void setAnalyzeCron(String analyzeCron) { this.analyzeCron = analyzeCron; }

    public int getBatchLimit() { return batchLimit; }
    public void setBatchLimit(int batchLimit) { this.batchLimit = Math.max(1, batchLimit); }

    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }

    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }
}
