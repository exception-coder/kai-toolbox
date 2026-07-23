package com.exceptioncoder.toolbox.common.forge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 部门领域对象。树形结构以 parentId 表达（0=根），仅作组织容器与数据权限归属，不参与鉴权链。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Department {
    private Long id;
    private long parentId;
    private String name;
    private String code;
    private int sort;
    private EntityStatus status;
    private long createdAt;
    private long updatedAt;
}
