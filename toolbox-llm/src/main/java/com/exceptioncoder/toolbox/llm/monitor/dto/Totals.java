package com.exceptioncoder.toolbox.llm.monitor.dto;

/** 区间内总量汇总。 */
public record Totals(
        long calls,
        long inputTokens,
        long outputTokens,
        long totalTokens,
        double cost,
        String currency,
        double errorRate,
        long avgLatencyMs) {
}
