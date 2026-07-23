package com.exceptioncoder.toolbox.common.forge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 角色领域对象。code 唯一并作为 JWT roles 声明值；builtin 内置角色不可删、不可改 code、不可收回权限。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Role {
    private Long id;
    private String name;
    private String code;
    private String description;
    private boolean builtin;
    private DataScopeType dataScopeType;
    private EntityStatus status;
    private long createdAt;
    private long updatedAt;
}
