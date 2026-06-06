package com.exceptioncoder.toolbox.common.auth.service;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;

/**
 * 一次签发产出的双 token + access 剩余秒数 + 关联用户。
 */
public record TokenPair(
        String accessToken,
        String refreshToken,
        long expiresInSeconds,
        AuthUser user
) {
}
