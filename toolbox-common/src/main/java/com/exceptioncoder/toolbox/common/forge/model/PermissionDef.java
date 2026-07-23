package com.exceptioncoder.toolbox.common.forge.model;

/**
 * 权限码声明。由各模块的 {@link com.exceptioncoder.toolbox.common.forge.service.PermissionContributor}
 * 提供，启动时被 PermissionRegistryService 同步进 forge_permission。代码声明是权威源。
 *
 * @param code       全局唯一，形如 {@code <module>:<type>:<action>}
 * @param name       展示名
 * @param type       MENU / BUTTON
 * @param module     所属 feature id
 * @param parentCode 分组展示用的父 code，可空
 * @param sort       同组排序
 */
public record PermissionDef(
        String code,
        String name,
        PermissionType type,
        String module,
        String parentCode,
        int sort
) {
    public static PermissionDef menu(String code, String name, String module, int sort) {
        return new PermissionDef(code, name, PermissionType.MENU, module, null, sort);
    }

    public static PermissionDef button(String code, String name, String module, String parentCode, int sort) {
        return new PermissionDef(code, name, PermissionType.BUTTON, module, parentCode, sort);
    }
}
