package com.exceptioncoder.toolbox.assistant.domain;

/**
 * 嵌入式助手的可编辑草稿。
 *
 * @param id 草稿标识
 * @param creatorUserId 创建者
 * @param sessionId 来源会话
 * @param kind BUG 或 SUGGESTION
 * @param title 标题
 * @param description 描述
 * @param contextSnapshotJson 上下文快照 JSON
 * @param evidenceJson 脱敏证据 JSON
 * @param status DRAFT 或 CONFIRMED
 * @param createTime 创建时间
 * @param updateTime 更新时间
 */
public record AssistantDraft(
        String id,
        long creatorUserId,
        String sessionId,
        String kind,
        String title,
        String description,
        String contextSnapshotJson,
        String evidenceJson,
        String status,
        long createTime,
        long updateTime
) {
}
