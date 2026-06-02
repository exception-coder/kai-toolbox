package com.exceptioncoder.toolbox.videocondense.api.dto;

import java.util.List;

/**
 * 作业视图。{@code progress} 是内存瞬时值（不落库），仅 ANALYZING/RENDERING 阶段有意义。
 * {@code segments} 在 ANALYZED 后有值。
 */
public record JobView(
        String jobId,
        String status,
        String inputPath,
        Double durationSec,
        double progress,
        List<SegmentView> segments,
        String error
) {}
