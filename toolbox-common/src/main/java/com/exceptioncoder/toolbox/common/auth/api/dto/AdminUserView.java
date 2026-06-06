package com.exceptioncoder.toolbox.common.auth.api.dto;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;

import java.util.List;

/** 管理后台用户视图，不含 passwordHash。 */
public record AdminUserView(long userId, String username, List<String> roles, boolean enabled, long createdAt) {

    public static AdminUserView from(AuthUser u) {
        return new AdminUserView(u.getId(), u.getUsername(), u.getRoles(), u.isEnabled(), u.getCreatedAt());
    }
}
