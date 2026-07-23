package com.exceptioncoder.toolbox.common.forge.api.dto;

/**
 * 设置/清空用户部门归属。departmentId 为空表示清空归属。
 */
public record SetDepartmentRequest(
        Long departmentId
) {
}
