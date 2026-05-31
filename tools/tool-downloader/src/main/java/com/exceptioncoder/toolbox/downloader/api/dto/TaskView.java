package com.exceptioncoder.toolbox.downloader.api.dto;

import com.exceptioncoder.toolbox.downloader.domain.DownloadTask;

import java.time.Instant;

/**
 * 任务列表/单条响应。totalSize=-1 表示服务端未返回 Content-Length。
 */
public record TaskView(
        long taskId,
        String url,
        String savePath,
        String filename,
        long totalSize,
        long downloadedSize,
        String state,
        String routeType,
        String routeProxy,
        String httpEngine,
        long currentRateBps,
        Long etaSeconds,
        Instant createdAt,
        Instant updatedAt
) {

    public static TaskView of(DownloadTask t, long downloadedSize, long currentRateBps, Long etaSeconds) {
        return new TaskView(
                t.getId(),
                t.getUrl(),
                t.getSavePath(),
                t.getFilename(),
                t.getTotalSize(),
                downloadedSize,
                t.getState().name(),
                t.getRouteType() == null ? null : t.getRouteType().name(),
                t.getRouteProxy(),
                t.getHttpEngine() == null ? "JDK" : t.getHttpEngine().name(),
                currentRateBps,
                etaSeconds,
                t.getCreatedAt(),
                t.getUpdatedAt());
    }
}
