package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 一个工作区一级项目。path 是稳定标识，displayName 仅用于界面展示。
 *
 * @param name        磁盘目录名
 * @param path        规范化绝对路径
 * @param alias       用户别名，未设置时为空
 * @param displayName 展示名，有别名时取别名，否则取目录名
 */
public record WorkspaceDirView(String name, String path, String alias, String displayName) {
}
