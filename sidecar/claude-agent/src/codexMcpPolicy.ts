export const CODEX_TOOLBOX_MCP_SERVERS = ['forge', 'erp_db', 'erp_app', 'srm_db', 'srm_app', 'scm_db'] as const

export type ToolboxMcpServerName = typeof CODEX_TOOLBOX_MCP_SERVERS[number]

export type ToolboxMcpRequirement = {
  name: ToolboxMcpServerName
  required: boolean
}

/** 普通开发会话只把 SQL 台账作为硬依赖；跨业务系统能力故障时允许会话继续工作。 */
export function standardToolboxMcpRequirements(
  sessionId?: string,
  forgeSqlRegistration = false,
): ToolboxMcpRequirement[] {
  return CODEX_TOOLBOX_MCP_SERVERS
    .filter(name => name !== 'forge' || (!!sessionId && forgeSqlRegistration))
    .map(name => ({ name, required: name === 'forge' }))
}
