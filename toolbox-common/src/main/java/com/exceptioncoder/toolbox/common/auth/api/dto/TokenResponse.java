package com.exceptioncoder.toolbox.common.auth.api.dto;

import com.exceptioncoder.toolbox.common.auth.service.TokenPair;

import java.util.List;

public record TokenResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresIn,
        CurrentUserView user,
        List<String> permissionCodes,
        boolean superAdmin
) {
    public static TokenResponse from(TokenPair pair) {
        return new TokenResponse(
                pair.accessToken(),
                pair.refreshToken(),
                "Bearer",
                pair.expiresInSeconds(),
                CurrentUserView.from(pair.user()),
                pair.permissionCodes(),
                pair.superAdmin()
        );
    }
}
