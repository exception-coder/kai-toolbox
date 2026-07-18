package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 「自维护机器人」锁定的 kai-toolbox 自身仓库路径。
 *
 * @param path   配置的绝对路径（{@code toolbox.claude-chat.workspace.self-repo-path}），未配置为空串
 * @param exists 该路径是否存在且为目录；path 为空或 exists=false 时前端隐藏机器人入口
 */
public record SelfRepoResponse(String path, boolean exists) {
}
