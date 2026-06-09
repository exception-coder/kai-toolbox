package com.exceptioncoder.toolbox.browserrequest.api.dto;

/** 「实时画面」远程点击：归一化坐标（相对显示图的比例，0..1）。 */
public record ClickRequest(double fx, double fy) {}
