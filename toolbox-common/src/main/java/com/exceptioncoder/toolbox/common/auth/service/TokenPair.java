package com.exceptioncoder.toolbox.common.auth.service;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;

import java.util.List;

/**
 * 一次签发产出的双 token + access 剩余秒数 + 关联用户 + 授权快照。
 * permissionCodes / superAdmin 供登录响应下发给前端做菜单与按钮显隐。
 */
public record TokenPair(
        String accessToken,
        String refreshToken,
        long expiresInSeconds,
        AuthUser user,
        List<String> permissionCodes,
        boolean superAdmin
) {
}
