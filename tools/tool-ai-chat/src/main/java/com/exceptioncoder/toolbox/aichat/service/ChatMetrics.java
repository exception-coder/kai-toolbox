package com.exceptioncoder.toolbox.aichat.service;

/**
 * 一轮助手回复的指标：耗时与 token 用量。任一项网关未提供则为 null（不臆造）。
 *
 * @param latencyMs        本轮流式耗时（毫秒）
 * @param promptTokens     输入 token（含缓存读）
 * @param completionTokens 输出 token
 * @param totalTokens      总 token
 * @param cachedTokens     命中缓存的输入 token（≈不计费）
 */
public record ChatMetrics(
        Long latencyMs,
        Long promptTokens,
        Long completionTokens,
        Long totalTokens,
        Long cachedTokens) {

    public static final ChatMetrics EMPTY = new ChatMetrics(null, null, null, null, null);
}
