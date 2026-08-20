package com.exceptioncoder.toolbox.claudechat.domain;

public record ReviewSpace(
        String id,
        String sourceSessionId,
        String reviewSessionId,
        String mode,
        String tokenHash,
        String tokenCiphertext,
        String status,
        String title,
        String contextSnapshot,
        long expiresAt,
        long createdAt,
        long updatedAt
) {
    public boolean active(long now) {
        return "ACTIVE".equals(status) && expiresAt > now;
    }
}
