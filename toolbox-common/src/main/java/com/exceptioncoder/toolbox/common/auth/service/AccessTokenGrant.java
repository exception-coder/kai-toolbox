package com.exceptioncoder.toolbox.common.auth.service;

/**
 * 不带刷新能力的短期访问令牌签发结果。
 */
public record AccessTokenGrant(
        String accessToken,
        long expiresInSeconds
) {
}
