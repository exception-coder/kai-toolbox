package com.exceptioncoder.toolbox.common.tool;

/**
 * 每个工具模块实现此接口并注册为 Spring Bean，
 * 启动时由 {@link ToolRegistry} 收集并通过 {@code GET /api/tools} 暴露给前端。
 */
public interface ToolDescriptor {

    String id();

    String name();

    /**
     * Lucide 图标名（kebab-case），前端按名加载。
     */
    String icon();

    /**
     * 前端路由路径，如 {@code /tools/treesize}。
     */
    String route();

    /**
     * 侧边栏分组名，同组工具会被聚合显示。可返回 {@code null}。
     */
    default String group() {
        return null;
    }

    default String description() {
        return null;
    }

    default int order() {
        return 100;
    }
}
