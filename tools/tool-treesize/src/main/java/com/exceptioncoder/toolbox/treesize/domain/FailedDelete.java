package com.exceptioncoder.toolbox.treesize.domain;

/**
 * A delete attempt that exhausted its retry budget. Tracked in memory so the user can
 * close whatever process holds the file and trigger a batch retry. Not persisted —
 * "the lock will pass" is a transient-by-nature concern.
 */
public record FailedDelete(
        String scanId,
        String path,
        String reason,
        int attempts,
        long lastAttemptAt
) {}
