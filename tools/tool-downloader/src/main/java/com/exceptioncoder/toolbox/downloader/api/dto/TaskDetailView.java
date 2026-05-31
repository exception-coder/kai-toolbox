package com.exceptioncoder.toolbox.downloader.api.dto;

import com.exceptioncoder.toolbox.downloader.domain.DownloadSegment;
import com.exceptioncoder.toolbox.downloader.domain.DownloadTask;

import java.time.Instant;
import java.util.List;

public record TaskDetailView(
        long taskId,
        String url,
        String savePath,
        String filename,
        long totalSize,
        boolean acceptRanges,
        long downloadedSize,
        String state,
        RouteDecisionView routeDecision,
        List<SegmentView> segments,
        String lastError,
        Instant createdAt,
        Instant updatedAt) {

    public static TaskDetailView of(DownloadTask t, List<DownloadSegment> segments, long downloadedSize) {
        return new TaskDetailView(
                t.getId(),
                t.getUrl(),
                t.getSavePath(),
                t.getFilename(),
                t.getTotalSize(),
                t.isAcceptRanges(),
                downloadedSize,
                t.getState().name(),
                RouteDecisionView.of(t),
                segments.stream().map(SegmentView::of).toList(),
                t.getLastError(),
                t.getCreatedAt(),
                t.getUpdatedAt());
    }
}
