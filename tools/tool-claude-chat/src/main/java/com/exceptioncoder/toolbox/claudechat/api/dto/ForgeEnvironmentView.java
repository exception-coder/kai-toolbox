package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * Forge 研发环境的分层就绪度快照。
 *
 * @param state 总览状态：READY、ATTENTION 或 BLOCKED
 * @param ready 所有阻断项是否就绪
 * @param readyCount 已就绪依赖数
 * @param totalCount 依赖总数
 * @param blockingCount 当前阻断项数量
 * @param checkedAt ISO-8601 检测时间
 * @param groups 依赖分组
 */
public record ForgeEnvironmentView(
        String state,
        boolean ready,
        int readyCount,
        int totalCount,
        int blockingCount,
        String checkedAt,
        List<DependencyGroupView> groups) {

    /**
     * @param id 稳定分组 ID
     * @param name 用户可见分组名
     * @param description 分组职责说明
     * @param items 分组内依赖项
     */
    public record DependencyGroupView(
            String id,
            String name,
            String description,
            List<DependencyView> items) {
    }

    /**
     * @param id 稳定依赖 ID
     * @param name 用户可见名称
     * @param state READY、MISSING、INCOMPATIBLE 或 ATTENTION
     * @param blocking 是否阻断完整初始化
     * @param version 已探测版本
     * @param summary 状态摘要
     * @param detail 有界诊断
     * @param installCommand 可复制的固定安装命令
     * @param officialUrl 官方说明链接
     */
    public record DependencyView(
            String id,
            String name,
            String state,
            boolean blocking,
            String version,
            String summary,
            String detail,
            String installCommand,
            String officialUrl) {
    }
}
