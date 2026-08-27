package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 系统路由检测候选。
 *
 * @param projectKey 团队知识项目键
 * @param displayName 项目显示名
 * @param projectPath 本机源码根
 * @param source 绑定来源
 * @param sourceAvailable 源码是否可用
 * @param knowledgeAvailable 业务知识是否可用
 */
public record SystemRouteCandidateView(
        String projectKey,
        String displayName,
        String projectPath,
        String source,
        boolean sourceAvailable,
        boolean knowledgeAvailable
) {
}
