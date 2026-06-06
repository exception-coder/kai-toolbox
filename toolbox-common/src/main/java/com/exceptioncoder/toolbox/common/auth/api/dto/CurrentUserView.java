package com.exceptioncoder.toolbox.common.auth.api.dto;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;

import java.util.List;

public record CurrentUserView(
        long userId,
        String username,
        List<String> roles
) {
    public static CurrentUserView from(AuthUser user) {
        return new CurrentUserView(user.getId(), user.getUsername(), user.getRoles());
    }

    public static CurrentUserView from(AuthPrincipal principal) {
        return new CurrentUserView(principal.userId(), principal.username(), principal.roles());
    }
}
