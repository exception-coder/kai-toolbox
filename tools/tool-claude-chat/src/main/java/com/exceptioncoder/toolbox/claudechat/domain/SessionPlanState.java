package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * Vibe Coding 逻辑会话的规划锁定状态。
 *
 * @param sessionId 会话 ID
 * @param planExpired 是否禁止继续输入
 * @param expiredAt 最近标记过期时间
 * @param unlockedAt 最近显式解锁时间
 */
public record SessionPlanState(
        String sessionId,
        boolean planExpired,
        Long expiredAt,
        Long unlockedAt
) {
}
