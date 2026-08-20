package com.exceptioncoder.toolbox.assistant.domain;

/**
 * 不可变的请求时上下文快照。
 *
 * @param id 快照标识
 * @param sessionId 来源会话
 * @param creatorUserId 创建者
 * @param protocolVersion 协议版本
 * @param snapshotJson 快照 JSON
 * @param createTime 创建时间
 */
public record AssistantContextSnapshot(
        String id,
        String sessionId,
        long creatorUserId,
        String protocolVersion,
        String snapshotJson,
        long createTime
) {
}
