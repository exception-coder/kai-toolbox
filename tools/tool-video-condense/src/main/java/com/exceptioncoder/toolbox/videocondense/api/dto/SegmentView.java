package com.exceptioncoder.toolbox.videocondense.api.dto;

/**
 * 速度曲线的一段视图。渲染只认 start/end/speed；type/score 仅供前端展示。
 * 既是 analyze 出参（曲线）也是 render 入参（用户可微调后回传）。
 */
public record SegmentView(double start, double end, double speed, String type, double score) {}
