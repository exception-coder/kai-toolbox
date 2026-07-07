package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 文本文件预览内容。
 *
 * @param name      文件名
 * @param path      相对会话 cwd 的路径
 * @param size      文件字节数
 * @param binary    是否二进制（含 NUL 或非法 UTF-8）：为真时 content 为空，前端只提示「二进制文件」
 * @param truncated 是否因超过上限被截断
 * @param content   文本内容（binary=true 时为空）
 */
public record FileContentView(String name, String path, long size, boolean binary, boolean truncated, String content) {
}
