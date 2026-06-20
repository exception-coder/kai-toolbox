package com.exceptioncoder.toolbox.llm.monitor.dto;

/** 单条配额水位（来自内存滚动窗口）。limit 为 null 表示未配置上限（unlimited）。 */
public record QuotaStatus(
        String scope,
        String key,
        long tokensUsed,
        Long tokenLimit,
        Double tokenRatio,
        long callsUsed,
        Integer callLimit,
        Double callRatio,
        double softThreshold,
        String state) {

    public static final String STATE_OK = "ok";
    public static final String STATE_WARN = "warn";
    public static final String STATE_EXCEEDED = "exceeded";
    public static final String STATE_UNLIMITED = "unlimited";
}
