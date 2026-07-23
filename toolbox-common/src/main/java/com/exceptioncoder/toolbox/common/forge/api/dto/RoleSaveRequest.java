package com.exceptioncoder.toolbox.common.forge.api.dto;

import com.exceptioncoder.toolbox.common.forge.model.DataScopeType;
import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import jakarta.validation.constraints.NotBlank;

/**
 * 角色新增/编辑请求。code 内置角色不可改；dataScopeType 为空默认 SELF；status 为空默认 ENABLED。
 */
public record RoleSaveRequest(
        @NotBlank(message = "角色名称不能为空") String name,
        @NotBlank(message = "角色编码不能为空") String code,
        String description,
        DataScopeType dataScopeType,
        EntityStatus status
) {
}
