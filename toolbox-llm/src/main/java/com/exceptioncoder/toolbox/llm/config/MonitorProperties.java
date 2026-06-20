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
