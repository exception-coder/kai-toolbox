package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 团队套件（插件 / MCP）在 Claude Code 端的状态，供「当前会话所用套件」展示。
 *
 * <p>插件用 {@code installed/available} 表达版本；MCP 无版本号，改用其本地知识库 git 仓状态
 * （{@code repoCommit/repoDate/behind}）表达「装的是哪一版、相对远端是否最新」。</p>
 *
 * @param name        套件名（插件 id 或 MCP server 名）
 * @param kind        "plugin" | "mcp"
 * @param marketplace 插件所属市场（MCP 为 null）
 * @param installed   插件已安装版本（MCP / 未装为 null）
 * @param available   插件市场可用版本（取不到 / MCP 为 null）
 * @param present     是否就绪（插件=已安装；MCP=已在 ~/.claude.json 配置）
 * @param repoCommit  MCP 知识库本地短 commit（非 MCP / 非 git 仓为 null）
 * @param repoDate    MCP 知识库本地提交日期 YYYY-MM-DD（同上）
 * @param behind      MCP 知识库落后远端的提交数（0=已最新；null=未知/无上游/未 fetch）
 */
public record SuiteStatusView(String name, String kind, String marketplace,
                              String installed, String available, boolean present,
                              String repoCommit, String repoDate, Integer behind) {
}
