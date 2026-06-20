package com.exceptioncoder.toolbox.llm.monitor.dto;

/** 按某维度（模型/tier/工具）分组的统计行。 */
public record GroupStat(
        String key,
        long calls,
        long totalTokens,
        double cost,
        double errorRate,
        long avgLatencyMs,
        double tokensEstimatedRatio) {
}
