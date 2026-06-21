package com.exceptioncoder.toolbox.llm.config;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * LLM 网关监控配置（toolbox.llm.monitor.*）。
 *
 * <p>对标 AgentScope 的可观测性：token/成本计量、调用追踪默认开启；配额为可选——
 * 未配置 {@link #quotas} 时网关无限额透传，不拦不告警，保持开箱即用。
 */
@Data
public class MonitorProperties {

    /** 监控总开关。关闭后网关退回纯路由（不埋点、不落库）。 */
    private boolean enabled = true;

    /** 成本展示货币单位（与价目表单价口径一致）。 */
    private String currency = "CNY";

    /** 异步落库有界队列容量。满时丢弃最旧并计 dropped，绝不反压调用。 */
    private int queueCapacity = 10000;

    /** 落库批量大小。 */
    private int batchSize = 200;

    /** 配额软阈值（占硬限比例），达到后 WARN 告警但不拒绝。 */
    private double softThreshold = 0.8;

    /**
     * 【可选】将 Java 侧 LLM 调用数据镜像到 AgentScope Studio（OTLP HTTP），
     * 例如 {@code http://localhost:3000}。留空则不推送，不影响主监控（llm-monitor 仪表盘）。
     *
     * <p>使用场景：同时运行了 Python sidecar（访客分析），想在一个地方（Studio）统一看
     * Java 侧和 Python 侧两个进程的 LLM trace——配上这个 URL 就能把 Java 侧也推过去。
     * 不关心 Studio、只用 toolbox 内置 llm-monitor 的话，不用配。
     *
     * <p>Studio 启动：{@code npm install -g @agentscope/studio && as_studio}（默认 :3000）。
     * 无需额外 Maven 依赖（Java 内置 HttpClient + OTLP JSON 格式，异步推送）。
     */
    private String agentScopeStudioUrl = "";

    /** 推送 AgentScope Studio 的 HTTP 超时（毫秒），超时直接丢弃，不影响业务。 */
    private int agentScopeStudioTimeoutMs = 3000;

    /** 配额规则；为空=无限额。 */
    private List<QuotaRule> quotas = new ArrayList<>();

    /** 单条配额规则：按 tier 或 model 维度，限当日 token / 调用次数。 */
    @Data
    public static class QuotaRule {
        /** 维度：tier | model。 */
        private String scope = "tier";
        /** 维度键：tier 名或 model id。 */
        private String key;
        /** 当日 token 硬上限；null=不限。 */
        private Long dailyTokenLimit;
        /** 当日调用次数硬上限；null=不限。 */
        private Integer dailyCallLimit;
    }
}
