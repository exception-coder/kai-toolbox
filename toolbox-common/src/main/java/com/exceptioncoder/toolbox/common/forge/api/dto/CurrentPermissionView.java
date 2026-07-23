package com.exceptioncoder.toolbox.common.forge.api.dto;

import java.util.List;

/**
 * 当前登录用户的权限快照（来自 JWT，非实时回源，FR-AUTH-04）。供前端刷新页面重新拉取。
 */
public record CurrentPermissionView(
        boolean superAdmin,
        List<String> permissionCodes
) {
}
