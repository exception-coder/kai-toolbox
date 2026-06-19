package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 会话视图。时间为毫秒时间戳（前端自行格式化，与项目其它接口一致用 epoch millis）。
 */
public record ConversationView(
        String id,
        String title,
        String model,
        String kind,
        String systemPrompt,
        Double temperature,
        Integer maxTokens,
        long createdAt,
        long updatedAt) {
}
