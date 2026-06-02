package com.exceptioncoder.toolbox.videocondense.domain;

/** 单帧/单取样点的活动度：{@code time} 原片时间（秒），{@code score} scene 变化分（0~1）。 */
public record ActivitySample(double time, double score) {}
