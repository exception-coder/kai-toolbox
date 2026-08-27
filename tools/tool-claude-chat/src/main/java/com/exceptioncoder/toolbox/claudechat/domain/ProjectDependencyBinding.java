package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * 已持久化的项目依赖坐标。
 *
 * @param projectPath 依赖项目路径
 * @param projectKey 知识库项目键
 * @param relation 与主项目的关系
 */
public record ProjectDependencyBinding(String projectPath, String projectKey, String relation) {
}
