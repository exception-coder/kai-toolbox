package com.exceptioncoder.toolbox.common.forge.model;

/**
 * 部门 / 角色启用状态。DISABLED 的角色不参与权限码解析，DISABLED 的部门不可作为新归属。
 */
public enum EntityStatus {
    ENABLED,
    DISABLED
}
