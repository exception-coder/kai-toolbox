package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 整体拆除工作区（只删链接 + 清单；目录非空则保留，源目录绝不触碰）。
 *
 * @param dir 工作区目录绝对路径（须含 .taskspace.json 清单，否则拒绝执行）
 */
public record TeardownRequest(String dir) {
}
