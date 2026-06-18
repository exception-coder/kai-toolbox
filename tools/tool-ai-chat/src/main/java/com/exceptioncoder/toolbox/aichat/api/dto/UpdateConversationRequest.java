package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 字段级更新会话：传哪个改哪个，null 表示不改。至少传一个。
 */
public record UpdateConversationRequest(
        String title,
        String model,
        String systemPrompt,
        Double temperature,
        Integer maxTokens) {
}
