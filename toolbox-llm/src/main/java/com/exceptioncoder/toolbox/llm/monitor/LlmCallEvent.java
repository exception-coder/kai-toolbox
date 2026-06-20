package com.exceptioncoder.toolbox.llm.monitor;

/**
 * 单次 LLM 调用的采集事件（一次 chat() 尝试 = 一条）。
 * 由 {@link MeteredChatModel} 组装，经 {@link LlmMetricsRecorder} 异步落库 + 内存累加。
 */
public record LlmCallEvent(
        String id,
        String createdAt,
        long epochMs,
        String tier,
        String modelId,
        String modelName,
        String toolId,
        String agent,
        String stage,
        Integer inputTokens,
        Integer outputTokens,
        Integer totalTokens,
        boolean tokensEstimated,
        double cost,
        long latencyMs,
        String status,
        String finishReason,
        int attempt,
        String errorType,
        String errorMessage,
        int requestChars,
        int responseChars) {

    public static final String STATUS_SUCCESS = "success";
    public static final String STATUS_ERROR = "error";
    public static final String STATUS_QUOTA_BLOCKED = "quota_blocked";

    public int totalTokensOrZero() {
        return totalTokens == null ? 0 : totalTokens;
    }
}
