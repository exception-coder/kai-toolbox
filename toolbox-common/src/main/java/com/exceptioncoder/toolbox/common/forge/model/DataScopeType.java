package com.exceptioncoder.toolbox.common.forge.model;

/**
 * 数据权限范围槽位。本期仅存储在角色上，不产生实际数据过滤——为后续数据权限预留。
 */
public enum DataScopeType {
    /** 全部数据。 */
    ALL,
    /** 本部门数据。 */
    DEPT,
    /** 仅本人数据。 */
    SELF,
    /** 自定义。 */
    CUSTOM
}
