package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.CleanupCandidate;

public record CleanupCandidateView(
        String category,
        String safety,
        String path,
        String name,
        boolean dir,
        long size,
        long fileCount,
        long dirCount,
        Long modifiedAt,
        String reason,
        String deleteHint
) {
    public static CleanupCandidateView from(CleanupCandidate c) {
        return new CleanupCandidateView(
                c.category().name(),
                c.safety().name(),
                c.path(),
                c.name(),
                c.dir(),
                c.size(),
                c.fileCount(),
                c.dirCount(),
                c.modifiedAt(),
                c.reason(),
                c.deleteHint()
        );
    }
}
