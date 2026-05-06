package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;

public record ScanView(
        String id,
        String rootPath,
        String status,
        long startedAt,
        Long finishedAt,
        long totalFiles,
        long totalDirs,
        long totalSize,
        String errorMsg,
        String sourceType,
        String sshHostId,
        String sourceDisplayName
) {
    public static ScanView from(ScanRecord r) {
        return new ScanView(
                r.getId(),
                r.getRootPath(),
                r.getStatus().name(),
                r.getStartedAt(),
                r.getFinishedAt(),
                r.getTotalFiles(),
                r.getTotalDirs(),
                r.getTotalSize(),
                r.getErrorMsg(),
                r.getSourceType() == null ? "LOCAL_WINDOWS" : r.getSourceType().name(),
                r.getSshHostId(),
                r.getSourceDisplayName()
        );
    }
}
