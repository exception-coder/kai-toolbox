package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.time.Instant;

/**
 * 已校验的 Session Client 访问身份。
 *
 * @param subjectUserId 参与者用户 ID
 * @param grantId 授权 ID
 * @param sessionId 会话 ID
 * @param tokenId 令牌唯一 ID
 * @param expiresAt 令牌失效时间
 */
public record SessionClientPrincipal(
        long subjectUserId,
        String grantId,
        String sessionId,
        String tokenId,
        Instant expiresAt) {
}
