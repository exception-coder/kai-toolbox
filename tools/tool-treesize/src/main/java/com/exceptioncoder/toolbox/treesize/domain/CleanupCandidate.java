package com.exceptioncoder.toolbox.treesize.domain;

import lombok.Builder;

@Builder
public record CleanupCandidate(
        CleanupCategory category,
        CleanupSafety safety,
        String path,
        String name,
        boolean dir,
        long size,
        long fileCount,
        long dirCount,
        Long modifiedAt,
        String reason,
        String deleteHint
) {}
