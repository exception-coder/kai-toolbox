package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.time.Instant;

/**
 * 仅保存摘要的单次会话邀请。
 *
 * @param id 邀请 ID
 * @param grantId 授权 ID
 * @param tokenHash 原始邀请值的不可逆摘要
 * @param expiresAt 失效时间
 * @param consumedAt 消费时间
 * @param consumedBy 消费用户 ID
 * @param revoked 是否已撤销
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record SessionInvitation(
        String id,
        String grantId,
        String tokenHash,
        Instant expiresAt,
        Instant consumedAt,
        Long consumedBy,
        boolean revoked,
        Instant createdAt,
        Instant updatedAt) {

    /**
     * 校验邀请可被指定授权主体消费。
     *
     * @param grant 目标授权
     * @param subjectUserId 当前用户 ID
     * @param now 当前时间
     */
    public void requireConsumable(SessionAccessGrant grant, long subjectUserId, Instant now) {
        if (!grantId.equals(grant.id()) || grant.subjectUserId() != subjectUserId) {
            throw invalid();
        }
        if (revoked || consumedAt != null || !expiresAt.isAfter(now)) {
            throw invalid();
        }
        grant.requireAccess(subjectUserId, grant.sessionId(), now);
    }

    private SessionGrantException invalid() {
        return new SessionGrantException(SessionClientErrorCode.INVITATION_INVALID,
                "邀请无效、已使用或已过期");
    }
}
