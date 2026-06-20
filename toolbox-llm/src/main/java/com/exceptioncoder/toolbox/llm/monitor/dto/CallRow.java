package com.exceptioncoder.toolbox.llm.monitor.dto;

/** 一条调用 trace（用于 /calls、/slow 与启动回填）。 */
public record CallRow(
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
        String errorMessage) {
}
