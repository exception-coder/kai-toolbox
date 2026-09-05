package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.time.Instant;

/**
 * Session Client WebSocket 的短时单次连接票据。
 *
 * @param id 票据 ID
 * @param grantId 授权 ID
 * @param subjectUserId 参与者用户 ID
 * @param tokenHash 原始票据值的不可逆摘要
 * @param expiresAt 失效时间
 * @param consumedAt 消费时间
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record SessionConnectionTicket(
        String id,
        String grantId,
        long subjectUserId,
        String tokenHash,
        Instant expiresAt,
        Instant consumedAt,
        Instant createdAt,
        Instant updatedAt) {
}
