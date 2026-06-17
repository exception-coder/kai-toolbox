package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * taskspace 选目录时的一个一级子目录条目。
 *
 * @param name   目录名（展示用）
 * @param path   绝对路径（作为建链接的源 target 传回）
 * @param isLink 该子目录本身是否已是链接（symlink / Windows junction），仅作展示提示
 */
public record TaskspaceDirView(String name, String path, boolean isLink) {
}
