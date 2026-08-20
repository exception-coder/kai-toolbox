package com.exceptioncoder.toolbox.common.auth.api.dto;

import com.exceptioncoder.toolbox.common.auth.service.AccessTokenGrant;

/**
 * 外部宿主登录响应；刻意不包含 Refresh Token。
 */
public record ExternalLoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn
) {
    public static ExternalLoginResponse from(AccessTokenGrant grant) {
        return new ExternalLoginResponse(grant.accessToken(), "Bearer", grant.expiresInSeconds());
    }
}
