package com.exceptioncoder.toolbox.docker.api.dto;

public record ContainerStatsView(
        String id,
        String name,
        double cpuPercent,
        long memUsageBytes,
        long memLimitBytes,
        double memPercent,
        long netRxBytes,
        long netTxBytes,
        long blockReadBytes,
        long blockWriteBytes
) {}
