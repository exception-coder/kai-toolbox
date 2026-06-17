package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 创建合并工作区请求。
 *
 * @param base    工作区放置的父目录（绝对路径）
 * @param name    工作区目录名，最终建在 {@code base/name}
 * @param members 被聚合的源项目目录绝对路径列表，逐个建链接
 */
public record CreateTaskspaceRequest(String base, String name, List<String> members) {
}
