package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteContext;

import java.util.List;

/**
 * 项目路由完整性检测结果。
 *
 * @param overallStatus HEALTHY、DEGRADED、UNVERIFIED 或 BROKEN
 * @param summary 面向操作者的结果摘要
 * @param route 已解析项目路由上下文，绑定失败时为空
 * @param runtimeTools Sidecar 实际 Tool 路由
 * @param menuTools 相关 Forge ToolDescriptor
 * @param checks 逐项检查与恢复动作
 */
public record SystemRouteInspectionView(
        String overallStatus,
        String summary,
        ProjectRouteContext route,
        RuntimeToolsView runtimeTools,
        List<MenuToolView> menuTools,
        List<RouteCheckView> checks
) {
    /**
     * Sidecar 实际 Tool 路由。
     *
     * @param status VERIFIED 或 UNAVAILABLE
     * @param targetSystems 实际目标系统
     * @param tools MCP Tool 坐标
     * @param protocolVersion 诊断协议版本
     */
    public record RuntimeToolsView(
            String status,
            List<String> targetSystems,
            List<RuntimeToolView> tools,
            Integer protocolVersion
    ) {
    }

    /**
     * MCP Tool 坐标。
     *
     * @param server MCP server 名
     * @param tool Tool 名
     */
    public record RuntimeToolView(String server, String tool) {
    }

    /**
     * Forge 后端 ToolDescriptor 辅助事实。
     *
     * @param id Tool ID
     * @param name Tool 名称
     * @param route 前端路由
     * @param description 描述
     */
    public record MenuToolView(String id, String name, String route, String description) {
    }

    /**
     * 单项路由检查。
     *
     * @param code 稳定检查码
     * @param status PASS、WARNING、UNVERIFIED 或 FAIL
     * @param title 状态标题
     * @param explanation 事实说明
     * @param recoveryAction 恢复动作
     * @param evidence 证据坐标
     */
    public record RouteCheckView(
            String code,
            String status,
            String title,
            String explanation,
            String recoveryAction,
            String evidence
    ) {
    }
}
