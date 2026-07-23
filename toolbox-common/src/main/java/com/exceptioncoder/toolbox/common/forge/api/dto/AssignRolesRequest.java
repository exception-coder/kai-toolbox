package com.exceptioncoder.toolbox.common.forge.api.dto;

import java.util.List;

/**
 * 给用户分配多角色（全量覆盖）。roleIds 为最终期望的完整角色集合。
 */
public record AssignRolesRequest(
        List<Long> roleIds
) {
}
