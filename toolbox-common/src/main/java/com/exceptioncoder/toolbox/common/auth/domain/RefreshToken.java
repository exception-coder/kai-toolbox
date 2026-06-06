package com.exceptioncoder.toolbox.common.auth.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 落库的 refresh token 记录。tokenHash 是 refresh 明文的哈希，校验时比对，避免明文落库。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RefreshToken {
    private String jti;
    private long userId;
    private String tokenHash;
    private long expiresAt;
    private boolean revoked;
    private long createdAt;
}
