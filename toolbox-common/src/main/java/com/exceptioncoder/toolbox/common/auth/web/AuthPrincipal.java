package com.exceptioncoder.toolbox.common.auth.web;

import java.util.List;

/**
 * 当前请求的已认证用户。jti 留存以便 logout 时把当前 access token 拉黑。
 */
public record AuthPrincipal(
        long userId,
        String username,
        List<String> roles,
        String jti,
        long expiresAt
) {
    public boolean hasAnyRole(String... candidates) {
        if (roles == null) {
            return false;
        }
        for (String c : candidates) {
            if (roles.contains(c)) {
                return true;
            }
        }
        return false;
    }
}
