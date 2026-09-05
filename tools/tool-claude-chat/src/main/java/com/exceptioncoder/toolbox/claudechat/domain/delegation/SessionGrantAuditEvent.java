package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.time.Instant;

/**
 * 不含消息正文和凭据的委托审计事件。
 *
 * @param id 审计事件 ID
 * @param grantId 授权 ID
 * @param actorUserId 操作者用户 ID，可为空表示系统动作
 * @param action 动作名称
 * @param result 结果名称
 * @param correlationId 关联请求 ID
 * @param detail 有界且不含敏感数据的说明
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record SessionGrantAuditEvent(
        String id,
        String grantId,
        Long actorUserId,
        String action,
        String result,
        String correlationId,
        String detail,
        Instant createdAt,
        Instant updatedAt) {
}
