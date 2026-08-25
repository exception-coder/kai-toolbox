package com.exceptioncoder.toolbox.assistant.domain;

/**
 * 当前用户在一个 Assistant 会话上的增量反馈分析状态。
 *
 * @param id 状态标识
 * @param creatorUserId Forge 认证用户标识
 * @param sessionId 会话标识
 * @param watermark 最近一次成功分析的会话水位
 * @param summary 有界反馈摘要
 * @param createTime 首次创建时间
 * @param updateTime 最后更新时间
 */
public record AssistantConversationAnalysis(
        String id,
        long creatorUserId,
        String sessionId,
        long watermark,
        String summary,
        long createTime,
        long updateTime) {
}
