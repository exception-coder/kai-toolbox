package com.exceptioncoder.toolbox.visitoranalysis.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 {@code toolbox.visitor-analysis.*}。由顶层 {@code @ConfigurationPropertiesScan} 自动注册。
 *
 * <p>灰区分类已从 Python AgentScope sidecar 迁回 Java：模型经共享 LLM 网关
 * （{@code toolbox-llm} 的 {@code ChatModelRouter}）按 {@link #tier} 档位取得，
 * 池化/限流/故障转移对本模块透明；该档位未配置时网关回退默认（本地 Ollama）。
 * 向量召回相关配置在 {@link VisitorAnalysisRagProperties}（{@code toolbox.visitor-analysis.rag.*}）。
 */
@ConfigurationProperties(prefix = "toolbox.visitor-analysis")
public class VisitorAnalysisProperties {

    /** 灰区分类用的 LLM 网关档位；网关未配置该档位时回退默认模型（本地 Ollama）。 */
    private String tier = "visitor";

    /**
     * 置信度阈值：LLM 给出的置信度低于此值时,needs_review=1 进人工复核队列。
     * 确定性命中（客户库/竞品）不受此约束，固定高置信。
     */
    private double reviewThreshold = 0.7;

    public String getTier() { return tier; }
    public void setTier(String tier) {
        this.tier = (tier == null || tier.isBlank()) ? "visitor" : tier.trim();
    }

    public double getReviewThreshold() { return reviewThreshold; }
    public void setReviewThreshold(double reviewThreshold) {
        this.reviewThreshold = Math.min(1.0, Math.max(0.0, reviewThreshold));
    }
}
