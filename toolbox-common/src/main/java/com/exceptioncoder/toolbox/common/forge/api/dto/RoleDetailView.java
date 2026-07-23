package com.exceptioncoder.toolbox.common.forge.api.dto;

import com.exceptioncoder.toolbox.common.forge.model.Role;

import java.util.List;

/**
 * 角色详情视图，含已绑权限码 id 集合，供角色权限勾选树回填。
 */
public record RoleDetailView(
        RoleView role,
        List<Long> permissionIds
) {
    public static RoleDetailView of(Role r, List<Long> permissionIds) {
        return new RoleDetailView(RoleView.from(r), permissionIds);
    }
}
