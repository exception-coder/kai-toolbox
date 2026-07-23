package com.exceptioncoder.toolbox.common.forge.api.dto;

import java.util.List;

/**
 * 角色权限码全量覆盖绑定请求。permissionIds 为最终期望的完整集合，服务层 diff 后落库。
 */
public record RolePermissionBindRequest(
        List<Long> permissionIds
) {
}
