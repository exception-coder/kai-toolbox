package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.exceptioncoder.toolbox.claudechat.domain.ResolvedProjectRouteBinding;

import java.util.List;

/**
 * 项目路由绑定的合并展示契约。
 *
 * @param projectKey 团队知识项目键
 * @param projectPath 本机源码根
 * @param displayName 项目显示名
 * @param aliases 可路由别名
 * @param source 绑定来源
 * @param explicit 是否为 SQLite 显式绑定
 * @param sourceAvailable 源码是否可用
 * @param knowledgeAvailable 业务知识是否可用
 * @param message 绑定说明
 */
public record ProjectRouteBindingView(
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
    /** 将内部绑定映射为 API 视图。 */
    public static ProjectRouteBindingView from(ResolvedProjectRouteBinding binding) {
        return new ProjectRouteBindingView(
                binding.projectKey(), binding.projectPath(), binding.displayName(), binding.aliases(),
                binding.source(), binding.explicit(), binding.sourceAvailable(),
                binding.knowledgeAvailable(), binding.message());
    }
}
