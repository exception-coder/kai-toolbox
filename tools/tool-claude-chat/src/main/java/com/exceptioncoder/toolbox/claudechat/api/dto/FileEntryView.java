package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 会话工作目录文件树里的一个条目。
 *
 * @param name  名称
 * @param path  相对会话 cwd 的路径（用 / 分隔，回传给后端做进一步展开/读取/定位）
 * @param abs   绝对路径（供「复制路径」「添加到聊天」——绝对路径 agent 可直接 Read，跨 cwd 无歧义）
 * @param dir   是否目录
 * @param size  文件字节数（目录为 0）
 * @param mtime 最后修改时间（Unix 毫秒）
 */
public record FileEntryView(String name, String path, String abs, boolean dir, long size, long mtime) {
}
