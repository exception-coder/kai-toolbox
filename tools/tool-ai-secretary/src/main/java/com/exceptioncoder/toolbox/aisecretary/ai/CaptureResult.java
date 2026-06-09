package com.exceptioncoder.toolbox.aisecretary.ai;

import java.util.List;

/**
 * 记录态的结构化输出根对象：一句话可能含多件事，故为数组（抗造点①）。
 */
public record CaptureResult(List<CapturedItem> items) {
}
