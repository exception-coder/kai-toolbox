package com.exceptioncoder.toolbox.flatten.api.dto;

import com.exceptioncoder.toolbox.flatten.domain.FlattenScan;

public record FlattenScanView(
        String id,
        String sourcePath,
        String targetPath,
        String status,
        long startedAt,
        Long finishedAt,
        long totalFiles,
        long totalSize,
        long duplicateGroups,
        long duplicateFiles,
        long duplicateSize,
        long filesToMove,
        long movedFiles,
        String errorMsg
) {
    public static FlattenScanView from(FlattenScan s) {
        return new FlattenScanView(
                s.getId(),
                s.getSourcePath(),
                s.getTargetPath(),
                s.getStatus().name(),
                s.getStartedAt(),
                s.getFinishedAt(),
                s.getTotalFiles(),
                s.getTotalSize(),
                s.getDuplicateGroups(),
                s.getDuplicateFiles(),
                s.getDuplicateSize(),
                s.getFilesToMove(),
                s.getMovedFiles(),
                s.getErrorMsg()
        );
    }
}
