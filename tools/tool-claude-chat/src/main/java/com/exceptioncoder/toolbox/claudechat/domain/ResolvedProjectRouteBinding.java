package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;

/**
 * 合并显式、托管与目录同名规则后的项目路由绑定。
 *
 * @param projectKey 团队知识项目键
 * @param projectPath 本机源码根，未绑定时为空
 * @param displayName 项目显示名
 * @param aliases 可路由别名
 * @param source 绑定来源
 * @param explicit 是否来自 SQLite 显式绑定
 * @param sourceAvailable 源码根是否存在
 * @param knowledgeAvailable 业务知识目录是否存在
 * @param message 绑定说明或缺口
 */
public record ResolvedProjectRouteBinding(
        String projectKey,
        String projectPath,
        String displayName,
        List<String> aliases,
        String source,
        boolean explicit,
        boolean sourceAvailable,
        boolean knowledgeAvailable,
        String message
) {
    public ResolvedProjectRouteBinding {
        aliases = List.copyOf(aliases);
    }
}
