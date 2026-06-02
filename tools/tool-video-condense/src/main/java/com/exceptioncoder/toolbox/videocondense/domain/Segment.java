package com.exceptioncoder.toolbox.videocondense.domain;

/** 分段评分结果：起止（秒）+ 平均活动度 + 类型 + 建议倍速。 */
public record Segment(double start, double end, double score, SegmentType type, double speed) {}
