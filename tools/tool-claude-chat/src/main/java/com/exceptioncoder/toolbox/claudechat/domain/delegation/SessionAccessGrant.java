package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.time.Instant;
import java.util.Objects;

/**
 * 一个业务参与者对一个 Forge 会话的受约束访问授权。
 *
 * @param id 授权 ID
 * @param sessionId 绑定的逻辑会话 ID
 * @param subjectUserId 参与者 Forge 用户 ID
 * @param ownerUserId 创建授权的会话所有者 ID
 * @param profile 服务端执行画像
 * @param status 生命周期状态
 * @param expiresAt 绝对失效时间
 * @param maxTurns 最大可提交回合数
 * @param usedTurns 已消费回合数
 * @param maxInputBytes 单条输入最大 UTF-8 字节数
 * @param version 乐观锁版本
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record SessionAccessGrant(
        String id,
        String sessionId,
        long subjectUserId,
        long ownerUserId,
        SessionDelegationProfile profile,
        SessionGrantStatus status,
        Instant expiresAt,
        int maxTurns,
        int usedTurns,
        int maxInputBytes,
        long version,
        Instant createdAt,
        Instant updatedAt) {

    private static final int MAX_ALLOWED_TURNS = 1_000;
    private static final int MAX_ALLOWED_INPUT_BYTES = 1_048_576;

    public SessionAccessGrant {
        requireText(id, "授权 ID");
        requireText(sessionId, "会话 ID");
        Objects.requireNonNull(profile, "执行画像不能为空");
        Objects.requireNonNull(status, "授权状态不能为空");
        Objects.requireNonNull(expiresAt, "失效时间不能为空");
        Objects.requireNonNull(createdAt, "创建时间不能为空");
        Objects.requireNonNull(updatedAt, "更新时间不能为空");
        if (subjectUserId <= 0 || ownerUserId <= 0) {
            throw new IllegalArgumentException("参与者和所有者必须是有效用户");
        }
        if (maxTurns <= 0 || maxTurns > MAX_ALLOWED_TURNS || usedTurns < 0 || usedTurns > maxTurns) {
            throw new IllegalArgumentException("回合额度不合法");
        }
        if (maxInputBytes <= 0 || maxInputBytes > MAX_ALLOWED_INPUT_BYTES) {
            throw new IllegalArgumentException("单条输入额度不合法");
        }
        if (version < 0) {
            throw new IllegalArgumentException("授权版本不能小于零");
        }
    }

    /**
     * 创建初始有效授权。
     *
     * @param id 授权 ID
     * @param sessionId 会话 ID
     * @param subjectUserId 参与者用户 ID
     * @param ownerUserId 所有者用户 ID
     * @param profile 执行画像
     * @param expiresAt 失效时间
     * @param maxTurns 最大回合数
     * @param maxInputBytes 单条输入字节数
     * @param now 当前时间
     * @return 新授权
     */
    public static SessionAccessGrant create(String id, String sessionId, long subjectUserId, long ownerUserId,
                                            SessionDelegationProfile profile, Instant expiresAt, int maxTurns,
                                            int maxInputBytes, Instant now) {
        if (!expiresAt.isAfter(now)) {
            throw new IllegalArgumentException("失效时间必须晚于当前时间");
        }
        return new SessionAccessGrant(id, sessionId, subjectUserId, ownerUserId, profile,
                SessionGrantStatus.ACTIVE, expiresAt, maxTurns, 0, maxInputBytes, 0, now, now);
    }

    /**
     * 校验参与者、会话和生命周期，返回可能惰性过期的授权快照。
     *
     * @param subject 用户 ID
     * @param targetSessionId 请求会话 ID
     * @param now 当前时间
     * @return 可继续使用的授权
     */
    public SessionAccessGrant requireAccess(long subject, String targetSessionId, Instant now) {
        if (subjectUserId != subject || !sessionId.equals(targetSessionId)) {
            throw new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED, "授权与当前用户或会话不匹配");
        }
        if (!expiresAt.isAfter(now) || status == SessionGrantStatus.EXPIRED) {
            throw new SessionGrantException(SessionClientErrorCode.GRANT_EXPIRED, "会话授权已过期");
        }
        if (status == SessionGrantStatus.REVOKED) {
            throw new SessionGrantException(SessionClientErrorCode.GRANT_REVOKED, "会话授权已撤销");
        }
        if (status == SessionGrantStatus.PAUSED) {
            throw new SessionGrantException(SessionClientErrorCode.GRANT_PAUSED, "会话授权已由所有者暂停");
        }
        return this;
    }

    /**
     * 暂停授权。
     *
     * @param expectedVersion 调用方读取到的版本
     * @param now 当前时间
     * @return 暂停后的授权
     */
    public SessionAccessGrant pause(long expectedVersion, Instant now) {
        requireVersion(expectedVersion);
        if (status != SessionGrantStatus.ACTIVE) {
            throw invalidTransition("只有有效授权可以暂停");
        }
        return withState(SessionGrantStatus.PAUSED, usedTurns, now);
    }

    /**
     * 恢复暂停授权。
     *
     * @param expectedVersion 调用方读取到的版本
     * @param now 当前时间
     * @return 恢复后的授权
     */
    public SessionAccessGrant resume(long expectedVersion, Instant now) {
        requireVersion(expectedVersion);
        if (status != SessionGrantStatus.PAUSED) {
            throw invalidTransition("只有暂停授权可以恢复");
        }
        if (!expiresAt.isAfter(now)) {
            throw new SessionGrantException(SessionClientErrorCode.GRANT_EXPIRED, "会话授权已过期");
        }
        return withState(SessionGrantStatus.ACTIVE, usedTurns, now);
    }

    /**
     * 永久撤销授权。
     *
     * @param expectedVersion 调用方读取到的版本
     * @param now 当前时间
     * @return 撤销后的授权
     */
    public SessionAccessGrant revoke(long expectedVersion, Instant now) {
        requireVersion(expectedVersion);
        if (status == SessionGrantStatus.REVOKED || status == SessionGrantStatus.EXPIRED) {
            throw invalidTransition("终态授权不能再次撤销");
        }
        return withState(SessionGrantStatus.REVOKED, usedTurns, now);
    }

    /**
     * 消费一个参与者回合并校验输入额度。
     *
     * @param inputBytes UTF-8 输入字节数
     * @param expectedVersion 调用方读取到的版本
     * @param now 当前时间
     * @return 更新额度后的授权
     */
    public SessionAccessGrant consumeTurn(int inputBytes, long expectedVersion, Instant now) {
        requireVersion(expectedVersion);
        requireAccess(subjectUserId, sessionId, now);
        if (inputBytes <= 0 || inputBytes > maxInputBytes) {
            throw new SessionGrantException(SessionClientErrorCode.LIMIT_EXCEEDED, "消息大小超过授权限制");
        }
        if (usedTurns >= maxTurns) {
            throw new SessionGrantException(SessionClientErrorCode.LIMIT_EXCEEDED, "会话授权回合数已用尽");
        }
        return withState(status, usedTurns + 1, now);
    }

    private SessionAccessGrant withState(SessionGrantStatus nextStatus, int nextUsedTurns, Instant now) {
        return new SessionAccessGrant(id, sessionId, subjectUserId, ownerUserId, profile, nextStatus,
                expiresAt, maxTurns, nextUsedTurns, maxInputBytes, version + 1, createdAt, now);
    }

    private void requireVersion(long expectedVersion) {
        if (version != expectedVersion) {
            throw new SessionGrantException(SessionClientErrorCode.SESSION_VERSION_CONFLICT,
                    "授权状态已更新，请刷新后重试");
        }
    }

    private SessionGrantException invalidTransition(String message) {
        return new SessionGrantException(SessionClientErrorCode.INVALID_INPUT, message);
    }

    private static void requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
    }
}
