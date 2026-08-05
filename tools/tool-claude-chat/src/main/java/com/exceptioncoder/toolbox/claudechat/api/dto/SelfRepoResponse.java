package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 「自维护机器人」锁定的 kai-toolbox 自身仓库路径。
 *
 * @param path   从当前运行目录向上自动识别出的 kai-toolbox 仓库绝对路径，未识别到为空串
 * @param exists 该路径是否存在且为目录；path 为空或 exists=false 时前端隐藏机器人入口
 */
public record SelfRepoResponse(String path, boolean exists) {
}
