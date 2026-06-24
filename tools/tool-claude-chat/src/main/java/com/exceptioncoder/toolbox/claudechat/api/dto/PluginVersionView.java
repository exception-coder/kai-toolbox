package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * Claude Code 端某个已安装插件的版本视图（供「当前会话所用插件」展示）。
 *
 * @param name      插件名（marketplace 内 plugin id）
 * @param marketplace 所属市场名
 * @param installed 已安装版本（=当前会话实际加载的版本；取不到为 null）
 * @param available 市场可用版本（尽力而为，取不到为 null）
 */
public record PluginVersionView(String name, String marketplace, String installed, String available) {
}
