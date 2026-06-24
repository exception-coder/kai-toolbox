package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 团队套件（插件 / MCP）在 Claude Code 端的状态，供「当前会话所用套件」展示。
 *
 * @param name        套件名（插件 id 或 MCP server 名）
 * @param kind        "plugin" | "mcp"
 * @param marketplace 插件所属市场（MCP 为 null）
 * @param installed   插件已安装版本（=当前会话所用；MCP / 未装为 null）
 * @param available   插件市场可用版本（尽力而为，取不到 / MCP 为 null）
 * @param present     是否就绪（插件=已安装；MCP=已在 ~/.claude.json 配置）
 */
public record SuiteStatusView(String name, String kind, String marketplace,
                              String installed, String available, boolean present) {
}
