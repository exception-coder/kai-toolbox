package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 项目依赖保存输入。
 *
 * @param projectPath 工作区内依赖项目路径
 * @param projectKey 知识库项目键，为空时由平台推导
 * @param relation 项目关系
 */
public record ProjectDependencyInput(String projectPath, String projectKey, String relation) {
}
