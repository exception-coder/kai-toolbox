package com.exceptioncoder.toolbox.common.forge.model;

/**
 * 权限码同步状态。ACTIVE 为代码当前仍声明的权限码；DEPRECATED 为代码已移除但库中仍存在的，
 * 软失效保留（不清理孤儿绑定），解析用户权限时过滤掉。
 */
public enum PermissionStatus {
    ACTIVE,
    DEPRECATED
}
