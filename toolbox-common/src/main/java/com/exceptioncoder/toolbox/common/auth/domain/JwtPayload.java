package com.exceptioncoder.toolbox.common.auth.domain;

import java.util.List;

/**
 * JwtService 校验通过后解析出的载荷。
 *
 * @param userId   sub，用户主键
 * @param username 冗余在 token 里，避免每次请求查库
 * @param roles    角色集合
 * @param permissionCodes 权限码快照（登录时解析写入，随请求携带；access token 有值，refresh 为空）
 * @param jti      token 唯一 id，黑名单 / refresh 轮换的键
 * @param type     ACCESS / REFRESH
 * @param expiresAt 过期时间（epoch 毫秒）
 */
public record JwtPayload(
        long userId,
        String username,
        List<String> roles,
        List<String> permissionCodes,
        String jti,
        TokenType type,
        long expiresAt
) {
}
