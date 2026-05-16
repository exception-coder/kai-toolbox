package com.exceptioncoder.toolbox.treesize.api.dto;

import java.util.List;

public record PlaybackStatsView(
        int activeFfmpeg,
        List<SegmentStatView> recentSegments
) {}
