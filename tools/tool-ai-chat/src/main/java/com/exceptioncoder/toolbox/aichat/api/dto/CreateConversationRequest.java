package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 新建会话请求。title 缺省由后端兜底；model 必填且须在 /models 清单内。
 * kind 缺省为 chat（绘图/视频会话由前端显式传 image/video）。
 */
public record CreateConversationRequest(
        String title,
        String model,
        String kind,
        String systemPrompt,
        Double temperature,
        Integer maxTokens) {
}
