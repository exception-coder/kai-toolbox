package com.exceptioncoder.toolbox.treesize.repository;

import org.springframework.stereotype.Component;

/**
 * One-bit dispatcher used by {@link NodeRepository} to decide which version of the video-library
 * SQL to run. {@link TreeSizeMigration} flips the bit to {@code true} only after the entire
 * {@code ext} backfill finishes — until then we have to fall back to the slow LIKE-OR query so
 * still-unmigrated rows remain visible in the listing.
 */
@Component
public class MigrationStatus {

    private volatile boolean extBackfillDone = false;

    public boolean isExtBackfillDone() {
        return extBackfillDone;
    }

    void markExtBackfillDone() {
        this.extBackfillDone = true;
    }
}
