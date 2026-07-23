package com.exceptioncoder.toolbox.common.forge.api.dto;

import com.exceptioncoder.toolbox.common.forge.model.Department;

import java.util.List;

/**
 * 部门树节点视图。children 为子部门，叶子为空列表。
 */
public record DepartmentView(
        long id,
        long parentId,
        String name,
        String code,
        int sort,
        String status,
        List<DepartmentView> children
) {
    public static DepartmentView of(Department d, List<DepartmentView> children) {
        return new DepartmentView(d.getId(), d.getParentId(), d.getName(), d.getCode(),
                d.getSort(), d.getStatus().name(), children);
    }
}
