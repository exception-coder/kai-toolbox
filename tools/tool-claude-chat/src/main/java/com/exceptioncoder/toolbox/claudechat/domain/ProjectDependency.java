package com.exceptioncoder.toolbox.claudechat.domain;

/** 主项目引用的外部项目及其当前可用状态。 */
public record ProjectDependency(
        String projectPath,
        String projectKey,
        boolean sourceAvailable,
        boolean knowledgeAvailable) {
}
