package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 新建会话请求。title 缺省由后端兜底；model 必填且须在 /models 清单内。
 */
public record CreateConversationRequest(
        String title,
        String model,
        String systemPrompt,
        Double temperature,
        Integer maxTokens) {
}
