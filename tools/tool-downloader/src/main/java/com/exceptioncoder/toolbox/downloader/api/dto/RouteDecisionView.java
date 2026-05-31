package com.exceptioncoder.toolbox.downloader.api.dto;

import com.exceptioncoder.toolbox.downloader.domain.DownloadTask;

import java.time.Instant;

public record RouteDecisionView(
        String routeType,
        String routeProxy,
        Long directTtfbMs,
        Long directThroughputBps,
        Long proxyTtfbMs,
        Long proxyThroughputBps,
        Instant decidedAt) {

    public static RouteDecisionView of(DownloadTask t) {
        if (t.getRouteType() == null) return null;
        return new RouteDecisionView(
                t.getRouteType().name(),
                t.getRouteProxy(),
                t.getProbeDirectTtfbMs(),
                t.getProbeDirectBps(),
                t.getProbeProxyTtfbMs(),
                t.getProbeProxyBps(),
                t.getUpdatedAt());
    }
}
