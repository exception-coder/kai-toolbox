package com.exceptioncoder.toolbox.common.forge.api.dto;

import com.exceptioncoder.toolbox.common.forge.model.Role;

/**
 * 角色列表视图。
 */
public record RoleView(
        long id,
        String name,
        String code,
        String description,
        boolean builtin,
        String dataScopeType,
        String status,
        long createdAt
) {
    public static RoleView from(Role r) {
        return new RoleView(r.getId(), r.getName(), r.getCode(), r.getDescription(), r.isBuiltin(),
                r.getDataScopeType().name(), r.getStatus().name(), r.getCreatedAt());
    }
}
