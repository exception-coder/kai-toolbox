package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependency;

/** 项目依赖及其源码、业务知识可用状态。 */
public record ProjectDependencyView(
        String projectPath,
        String projectKey,
        boolean sourceAvailable,
        boolean knowledgeAvailable) {

    public static ProjectDependencyView from(ProjectDependency dependency) {
        return new ProjectDependencyView(
                dependency.projectPath(),
                dependency.projectKey(),
                dependency.sourceAvailable(),
                dependency.knowledgeAvailable());
    }
}
