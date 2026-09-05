package com.exceptioncoder.forge.sessionrelay;

import java.time.Instant;

/** 仅在业务服务端保存的 Forge 委托绑定。 */
public record ForgeRelayBinding(long subjectUserId, String accessToken, Instant expiresAt,
                                String grantId, String sessionId) {
}
