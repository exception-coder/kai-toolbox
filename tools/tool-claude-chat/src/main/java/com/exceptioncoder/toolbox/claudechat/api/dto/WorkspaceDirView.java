package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 一个一级子目录条目。name 用于展示，path 作为新建会话的 cwd 传入。
 */
public record WorkspaceDirView(String name, String path) {
}
