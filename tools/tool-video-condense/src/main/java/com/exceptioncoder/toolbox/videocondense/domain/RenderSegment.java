package com.exceptioncoder.toolbox.videocondense.domain;

/** 渲染只认这三个字段：段起止（秒，原片时间轴）+ 倍速（>0，1.0=原速）。 */
public record RenderSegment(double start, double end, double speed) {}
