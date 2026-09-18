export const CODEX_TOOLBOX_MCP_SERVERS = ['forge'] as const

export type ToolboxMcpServerName = typeof CODEX_TOOLBOX_MCP_SERVERS[number]

export type ToolboxMcpRequirement = {
  name: ToolboxMcpServerName
  required: boolean
}

/** 普通开发会话只装配 Forge；业务系统资源由 Forge 动态发现，不再按系统增加 MCP。 */
export function standardToolboxMcpRequirements(
  sessionId?: string,
  _forgeSqlRegistration = false,
): ToolboxMcpRequirement[] {
  return CODEX_TOOLBOX_MCP_SERVERS
    .filter(() => !!sessionId)
    .map(name => ({ name, required: true }))
}
