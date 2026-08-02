package com.exceptioncoder.toolbox.common.auth.api.dto;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;

/** 业务指派场景可见的最小账号信息，不暴露角色、状态和审计字段。 */
public record AssignableUserView(long userId, String username, String realName) {

    public static AssignableUserView from(AuthUser user) {
        return new AssignableUserView(user.getId(), user.getUsername(), user.getRealName());
    }
}
