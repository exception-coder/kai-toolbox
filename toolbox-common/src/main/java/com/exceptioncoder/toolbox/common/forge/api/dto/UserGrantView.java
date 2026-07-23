package com.exceptioncoder.toolbox.common.forge.api.dto;

import java.util.List;

/**
 * 用户当前的 Forge 授权归属：已绑角色 id 集合 + 部门 id（可空）。供账号管理页授权抽屉回填。
 */
public record UserGrantView(
        long userId,
        List<Long> roleIds,
        Long departmentId
) {
}
