package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * 计划评审结论形成的开发侧待处理意见。
 *
 * @param id 反馈标识
 * @param reviewSpaceId 评审空间标识
 * @param sourceSessionId 来源开发会话标识
 * @param reviewSessionId 评审会话标识
 * @param content 评审结论正文
 * @param sourceMessageId 评审消息标识，用于防止重复提交
 * @param status 处理状态
 * @param createdAt 创建时间
 * @param handledAt 处理时间
 */
public record ReviewFeedback(
        String id,
        String reviewSpaceId,
        String sourceSessionId,
        String reviewSessionId,
        String content,
        String sourceMessageId,
        String status,
        long createdAt,
        Long handledAt
) {
}
