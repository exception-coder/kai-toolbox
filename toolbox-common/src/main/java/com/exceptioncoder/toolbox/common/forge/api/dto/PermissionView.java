package com.exceptioncoder.toolbox.common.forge.api.dto;

import com.exceptioncoder.toolbox.common.forge.model.Permission;

/**
 * 权限码视图（后台只读）。供角色权限勾选树按 module + parentCode 分组展示。
 */
public record PermissionView(
        long id,
        String code,
        String name,
        String type,
        String module,
        String parentCode,
        int sort,
        String status
) {
    public static PermissionView from(Permission p) {
        return new PermissionView(p.getId(), p.getCode(), p.getName(), p.getType().name(),
                p.getModule(), p.getParentCode(), p.getSort(), p.getStatus().name());
    }
}
