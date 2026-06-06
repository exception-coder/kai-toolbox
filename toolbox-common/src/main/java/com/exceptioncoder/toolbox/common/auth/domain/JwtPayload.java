package com.exceptioncoder.toolbox.common.auth.domain;

import java.util.List;

/**
 * JwtService 校验通过后解析出的载荷。
 *
 * @param userId   sub，用户主键
 * @param username 冗余在 token 里，避免每次请求查库
 * @param roles    角色集合
 * @param jti      token 唯一 id，黑名单 / refresh 轮换的键
 * @param type     ACCESS / REFRESH
 * @param expiresAt 过期时间（epoch 毫秒）
 */
public record JwtPayload(
        long userId,
        String username,
        List<String> roles,
        String jti,
        TokenType type,
        long expiresAt
) {
}
