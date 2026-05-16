package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.SegmentStat;

public record SegmentStatView(
        int idx,
        String file,
        String mode,
        long spawnMs,
        long firstByteMs,
        long totalMs,
        long bytesOut,
        boolean aborted,
        long at
) {
    public static SegmentStatView from(SegmentStat s) {
        return new SegmentStatView(
                s.idx(),
                s.fileName(),
                s.mode(),
                s.spawnMs(),
                s.firstByteMs(),
                s.totalMs(),
                s.bytesOut(),
                s.aborted(),
                s.atEpochMs()
        );
    }
}
