package com.exceptioncoder.toolbox.common.forge.service;

import com.exceptioncoder.toolbox.common.forge.model.PermissionDef;

import java.util.List;

/**
 * 权限码声明 SPI。任何模块把自己的菜单/按钮权限码就近声明为一个 {@code @Component}，
 * PermissionRegistryService 启动时收集所有实现并幂等同步进 forge_permission。
 *
 * <p>与既有 {@code ToolDescriptor} → {@code ToolRegistry} 的 bean 收集模式一致——模块自治、声明即权威。</p>
 */
public interface PermissionContributor {

    /** 本模块声明的权限码清单。 */
    List<PermissionDef> permissions();
}
