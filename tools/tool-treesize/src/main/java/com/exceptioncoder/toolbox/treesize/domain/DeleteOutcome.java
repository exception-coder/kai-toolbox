package com.exceptioncoder.toolbox.treesize.domain;

/**
 * Result of a single-file delete attempt.
 *
 * <p>{@code QUEUED} replaces the previous "throw IOException, propagate 500" path for file-in-use
 * style failures: the entry is recorded in {@code FailedDeleteRegistry} and the caller decides
 * later whether to retry. Truly unexpected exceptions still propagate.
 */
public enum DeleteOutcome {
    TRASHED,
    PERMANENT,
    QUEUED
}
