import { parseBrowserFollowUp, parseVibeBrowserRequest, VIBE_BROWSER_SERVER, VIBE_BROWSER_TOOL, type VibeBrowserRequest } from './vibeBrowser.js'

// Only this explicit retry can reuse the previous user's named link.
const REPEAT_LINK_CLICK = new RegExp([
  '^(?:(?:请|你)?\\s*(?:再|尝试|试着|重新)?\\s*(?:点击|点)(?:一下|一次)?\\s*',
  '(?:刚才|之前|上次|对应)(?:的)?(?:站点|网站|页面|网页)?(?:的)?(?:那个|这个)?(?:链接|菜单按钮)',
  '(?:[，,\\s]*(?:看看|确认)(?:是否|能否)(?:可以)?(?:点击|跳转))?[。！？!?]?',
  '|(?:please\\s+)?click\\s+the\\s+(?:same|previous)\\s+link(?:\\s+again)?[.!]?)$',
].join(''), 'iu')

/** 服务端下发的装配清单及与当前用户回合绑定的可选网页操作。 */
export interface ConsultToolAssembly {
  tools: string[]
  mcpServers: string[]
  runtimeSessionId?: string
  runtimeToken?: string
  managedWebAccount?: boolean
  browserRequest?: VibeBrowserRequest
}

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
  if (record.runtimeSessionId !== undefined && (typeof record.runtimeSessionId !== 'string'
    || !/^[a-zA-Z0-9-]{1,100}$/.test(record.runtimeSessionId))) throw new Error('咨询会话标识无效')
  if (record.runtimeToken != null && (typeof record.runtimeToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(record.runtimeToken))) throw new Error('咨询资源签名无效')
  if (record.managedWebAccount !== undefined && typeof record.managedWebAccount !== 'boolean') throw new Error('咨询账号选路无效')
  const current = typeof record.browserUserRequest === 'string' ? record.browserUserRequest.trim() : ''
  // A direct URL covered by a saved account must use its authenticated resource.
  // A relative click has a separate, server-checked public target from this segment.
  let browserRequest = record.managedWebAccount === true ? undefined : parseVibeBrowserRequest(current)
  if (!browserRequest && current && !/https?:\/\//i.test(current)) {
    if (typeof record.browserCurrentPageUrl === 'string') {
      browserRequest = parseBrowserFollowUp(current, record.browserCurrentPageUrl)
    } else if (typeof record.previousBrowserUserRequest === 'string' && REPEAT_LINK_CLICK.test(current)) {
      const previous = parseVibeBrowserRequest(record.previousBrowserUserRequest)
      if (previous?.linkName) browserRequest = previous
    }
  }
  return { tools: names(record.tools), mcpServers: names(record.mcpServers),
    ...(record.managedWebAccount !== undefined ? { managedWebAccount: record.managedWebAccount } : {}),
    ...(browserRequest ? { browserRequest } : {}),
    ...(record.runtimeSessionId ? { runtimeSessionId: record.runtimeSessionId as string } : {}),
    ...(record.runtimeToken ? { runtimeToken: record.runtimeToken as string } : {}) }
}

/** Claude 的数据库 MCP 使用独立服务名，配置保持与 Codex 相同的逻辑工具名。 */
export function assemblyAllows(assembly: ConsultToolAssembly | undefined, server: string, tool?: string): boolean {
  if (/^(erp|srm|scm)_(db|app)$/.test(server) || /^(erp|srm|scm)_db_query$/.test(tool ?? '')) return false
  if (server === VIBE_BROWSER_SERVER) return !!assembly?.browserRequest && assembly.mcpServers.includes(server)
    && assembly.tools.includes(VIBE_BROWSER_TOOL) && (tool == null || tool === VIBE_BROWSER_TOOL)
  if (!assembly) return true
  if (!assembly.mcpServers.includes(server)) return false
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
  for (const server of Object.keys(servers)) {
    if (/^(erp|srm|scm)_(db|app)$/.test(server)) delete servers[server]
  }
  if (!assembly) return
  for (const server of Object.keys(servers)) {
    if (!assemblyAllows(assembly, server)) { delete servers[server]; continue }
    if (server === 'consult-readonly') {
      const config = servers[server] as Record<string, unknown>
      config.env = { ...(config.env as Record<string, unknown> ?? {}), CONSULT_ENABLED_TOOLS: JSON.stringify(assembly.tools),
        ...(assembly.runtimeSessionId ? { TOOLBOX_SESSION_ID: assembly.runtimeSessionId } : {}),
        ...(assembly.runtimeToken ? { CONSULT_RESOURCE_TOKEN: assembly.runtimeToken } : {}) }
    }
  }
}

export function filterCodexAssembly(config: Record<string, unknown>, assembly?: ConsultToolAssembly): Record<string, unknown> {
  if (!assembly) return config
  const servers = config.mcp_servers as Record<string, Record<string, unknown>> | undefined
  for (const [server, value] of Object.entries(servers ?? {})) {
    if (value.enabled === false) continue
    if (!assemblyAllows(assembly, server)) { value.enabled = false; continue }
    if (server === 'consult-readonly') {
      value.env = { ...(value.env as Record<string, unknown> ?? {}),
        CONSULT_ENABLED_TOOLS: JSON.stringify(assembly.tools),
        ...(assembly.runtimeSessionId ? { TOOLBOX_SESSION_ID: assembly.runtimeSessionId } : {}),
        ...(assembly.runtimeToken ? { CONSULT_RESOURCE_TOKEN: assembly.runtimeToken } : {}) }
    }
    if (server === 'consult-readonly' && assembly.runtimeSessionId && Array.isArray(value.enabled_tools)) {
      value.enabled_tools = [...new Set([...value.enabled_tools,
        ...['consult_resources', 'consult_resource_query', 'consult_web', 'generate_consult_document', 'design_consult_document', 'preview_consult_document', 'read_consult_attachment', 'read_consult_history']
          .filter(tool => assembly.tools.includes(tool))])]
    }
    if (Array.isArray(value.enabled_tools)) {
      value.enabled_tools = value.enabled_tools.filter(tool => assemblyAllows(assembly, server, String(tool)))
      if ((value.enabled_tools as unknown[]).length === 0) value.enabled = false
    }
  }
  return config
}
