package com.exceptioncoder.toolbox.common.forge.api.dto;

import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import jakarta.validation.constraints.NotBlank;

/**
 * 部门新增/编辑请求。parentId 为空或 0 表示根；code 可空（可空唯一）；status 为空默认 ENABLED。
 */
public record DepartmentSaveRequest(
        Long parentId,
        @NotBlank(message = "部门名称不能为空") String name,
        String code,
        Integer sort,
        EntityStatus status
) {
}
