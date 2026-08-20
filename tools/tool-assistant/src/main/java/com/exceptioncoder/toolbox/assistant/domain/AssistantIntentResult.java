package com.exceptioncoder.toolbox.assistant.domain;

/**
 * 意图识别结果。
 *
 * @param intent 意图
 * @param confidence 置信度
 * @param reason 依据摘要
 */
public record AssistantIntentResult(AssistantIntent intent, double confidence, String reason) {
}
