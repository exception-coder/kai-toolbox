package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 拉取项目结果。
 *
 * @param name 克隆出的目录名（仓库名）
 * @param path 克隆落地的绝对路径（可直接作为新建会话 cwd）
 */
public record CloneResponse(String name, String path) {
}
