package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 会话项目重命名请求。
 *
 * @param oldName 当前项目名称
 * @param newName 新项目名称
 */
public record RenameSessionProjectRequest(String oldName, String newName) {
}

