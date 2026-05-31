package com.exceptioncoder.toolbox.downloader.domain;

import java.time.Instant;

/**
 * RouteProber 输出的链路决策。每个任务一份，写入 tool_downloader_task 表。
 * directXxx / proxyXxx 字段中失败的那一侧用 null 表示。
 */
public record RouteDecision(
        RouteType route,
        String proxyOrigin,            // 当 route=PROXY 时填代理 URL，否则 null
        Long directTtfbMs,
        Long directThroughputBps,
        Long proxyTtfbMs,
        Long proxyThroughputBps,
        Instant decidedAt) {

    public static RouteDecision directOnly(long ttfbMs, long bps) {
        return new RouteDecision(RouteType.DIRECT, null, ttfbMs, bps, null, null, Instant.now());
    }

    public static RouteDecision proxyOnly(String proxyOrigin, long ttfbMs, long bps) {
        return new RouteDecision(RouteType.PROXY, proxyOrigin, null, null, ttfbMs, bps, Instant.now());
    }
}
