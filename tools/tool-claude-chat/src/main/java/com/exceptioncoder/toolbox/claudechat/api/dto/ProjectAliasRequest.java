package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 项目别名保存请求；空白 alias 表示清除。
 *
 * @param projectPath 当前工作区一级项目路径
 * @param alias       用户别名
 */
public record ProjectAliasRequest(String projectPath, String alias) {
}
