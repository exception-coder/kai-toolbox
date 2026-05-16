package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.FailedDelete;

/** Wire shape of a single {@link FailedDelete} row; {@code lastAttemptAt} is epoch millis. */
public record FailedDeleteView(
        String scanId,
        String path,
        String reason,
        int attempts,
        long lastAttemptAt
) {
    public static FailedDeleteView from(FailedDelete f) {
        return new FailedDeleteView(f.scanId(), f.path(), f.reason(), f.attempts(), f.lastAttemptAt());
    }
}
