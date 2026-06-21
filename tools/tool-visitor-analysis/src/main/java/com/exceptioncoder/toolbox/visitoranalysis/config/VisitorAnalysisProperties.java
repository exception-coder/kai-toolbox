package com.exceptioncoder.toolbox.visitoranalysis.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 {@code toolbox.visitor-analysis.*}。由顶层 {@code @ConfigurationPropertiesScan} 自动注册。
 */
@ConfigurationProperties(prefix = "toolbox.visitor-analysis")
public class VisitorAnalysisProperties {

    /** Python AgentScope sidecar 地址。空表示未配置：灰区无法判别，将直接降级为 UNKNOWN + 待人工确认。 */
    private String sidecarUrl = "http://127.0.0.1:9600";

    /** 调用 sidecar 的超时秒数。 */
    private int sidecarTimeoutSeconds = 60;

    /** 灰区分类用的模型名（base-url / api-key 复用配置中心 toolbox.ai-chat 的 4sapi）。 */
    private String llmModel = "gpt-5-mini";

    /**
     * 置信度阈值：LLM 给出的置信度低于此值时,needs_review=1 进人工复核队列。
     * 确定性命中（客户库/竞品）不受此约束，固定高置信。
     */
    private double reviewThreshold = 0.7;

    public String getSidecarUrl() { return sidecarUrl; }
    public void setSidecarUrl(String sidecarUrl) {
        this.sidecarUrl = sidecarUrl == null ? "" : sidecarUrl.trim();
    }

    public int getSidecarTimeoutSeconds() { return sidecarTimeoutSeconds; }
    public void setSidecarTimeoutSeconds(int sidecarTimeoutSeconds) {
        this.sidecarTimeoutSeconds = Math.max(1, sidecarTimeoutSeconds);
    }

    public String getLlmModel() { return llmModel; }
    public void setLlmModel(String llmModel) {
        this.llmModel = (llmModel == null || llmModel.isBlank()) ? "gpt-5-mini" : llmModel.trim();
    }

    public double getReviewThreshold() { return reviewThreshold; }
    public void setReviewThreshold(double reviewThreshold) {
        this.reviewThreshold = Math.min(1.0, Math.max(0.0, reviewThreshold));
    }
}
