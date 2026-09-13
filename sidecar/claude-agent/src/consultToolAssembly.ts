/** 服务端节点配置的会话级并集；永远与引擎已有只读/系统范围取交集。 */
export interface ConsultToolAssembly { tools: string[]; mcpServers: string[] }

export function parseConsultToolAssembly(value: unknown): ConsultToolAssembly | undefined {
  if (value == null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('咨询工具装配格式无效')
  const record = value as Record<string, unknown>
  const names = (raw: unknown): string[] => {
    if (!Array.isArray(raw) || raw.length > 100 || raw.some(v => typeof v !== 'string' || !/^[a-z][a-z0-9_-]{0,99}$/.test(v))) {
      throw new Error('咨询工具装配名称无效')
    }
    return [...new Set(raw as string[])]
  }
  return { tools: names(record.tools), mcpServers: names(record.mcpServers) }
}

/** Claude 的数据库 MCP 使用独立服务名，配置保持与 Codex 相同的逻辑工具名。 */
export function assemblyAllows(assembly: ConsultToolAssembly | undefined, server: string, tool?: string): boolean {
  if (!assembly) return true
  const database = /^(erp|srm|scm)_db$/.exec(server)
  const provider = database ? 'consult-readonly' : server
  if (!assembly.mcpServers.includes(provider)) return false
  if (database) return assembly.tools.includes(`${database[1]}_db_query`)
  if (server === 'consult-readonly') return tool == null
    ? assembly.tools.length > 0 : assembly.tools.includes(tool)
  return true
}

export function assemblyAllowsTool(assembly: ConsultToolAssembly | undefined, name: string): boolean {
  if (!assembly) return true
  const match = /^mcp__([^_]+(?:_[^_]+)*)__([\w-]+)$/.exec(name)
  return !!match && assemblyAllows(assembly, match[1], match[2])
}

export function filterClaudeAssembly<T>(servers: Record<string, T>, assembly?: ConsultToolAssembly): void {
  if (!assembly) return
  for (const server of Object.keys(servers)) {
    if (!assemblyAllows(assembly, server)) { delete servers[server]; continue }
    if (server === 'consult-readonly') {
      const config = servers[server] as Record<string, unknown>
      config.env = { ...(config.env as Record<string, unknown> ?? {}), CONSULT_ENABLED_TOOLS: JSON.stringify(assembly.tools) }
    }
  }
}

export function filterCodexAssembly(config: Record<string, unknown>, assembly?: ConsultToolAssembly): Record<string, unknown> {
  if (!assembly) return config
  const servers = config.mcp_servers as Record<string, Record<string, unknown>> | undefined
  for (const [server, value] of Object.entries(servers ?? {})) {
    if (value.enabled === false) continue
    if (!assemblyAllows(assembly, server)) { value.enabled = false; continue }
    if (Array.isArray(value.enabled_tools)) {
      value.enabled_tools = value.enabled_tools.filter(tool => assemblyAllows(assembly, server, String(tool)))
      if ((value.enabled_tools as unknown[]).length === 0) value.enabled = false
    }
  }
  return config
}
