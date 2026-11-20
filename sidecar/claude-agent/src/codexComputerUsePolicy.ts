export const CODEX_COMPUTER_USE_RECOVERY_STEER = [
  '【浏览器动态节点恢复】使用 cua_repl 操作会实时刷新的页面时，可访问性节点编号只对最近一次页面快照有效。',
  '每次点击、输入、滚动或页面导航后，必须重新读取 getAXState，再从新快照定位下一目标；不得复用动作前的节点编号。',
  '若工具返回 Node is detached from document、节点不存在或执行上下文已销毁，立即重新读取页面状态并按目标语义重新定位，只重试该动作一次；禁止原样重复旧节点调用。',
  '只有 cua_repl 运行时本身不可用时才使用 js_reset；动态节点失效不需要重置运行时。',
].join('\n')

const DETACHED_NODE_PATTERN = /node is detached from document|node (?:does not exist|not found)|execution context (?:was )?destroyed/i

const OFFICIAL_BROWSER_PLUGINS = ['browser@openai-bundled', 'chrome@openai-bundled',
  'unified-computer-use@openai-bundled'] as const

/** Use the native loader, including its host permissions and lifecycle hooks.
 * Never copy a desktop manifest, pipe or identity into a Forge-owned MCP server.
 */
export function withConsultComputerUse(config: Record<string, unknown>, effective: Record<string, unknown>): Record<string, unknown> {
  const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object'
    && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const plugins: Record<string, unknown> = { _default: { enabled: false } }
  // Explicit lower-layer enablements win over _default, so disable each of them too.
  for (const name of Object.keys({ ...record(effective.plugins), ...record(config.plugins) })) {
    if (name !== '_default') plugins[name] = { enabled: false }
  }
  for (const name of OFFICIAL_BROWSER_PLUGINS) plugins[name] = { enabled: true }
  plugins['unified-computer-use@openai-bundled'] = {
    enabled: true,
    mcp_servers: { cua_repl: { enabled: true, enabled_tools: ['js', 'js_reset', 'turn_ended'] } },
  }
  return { ...config, features: { ...record(config.features), plugins: true }, plugins }
}

/** Configuration flags are not proof that the desktop provider exposed its tool. */
export function consultBrowserNotice(input: readonly Record<string, unknown>[],
  statuses: readonly { name: string; tools: ReadonlySet<string> }[] | undefined): string | undefined {
  const requested = input.some(item => item.type === 'text' && typeof item.text === 'string'
    && /浏览器|点击|点选|网页取数|页面筛选|下拉框|computer.use|browser.use|cua_repl/i.test(item.text))
  if (!requested) return undefined
  if (!statuses) return '未能核对本轮原生浏览器工具目录，点击能力未验证。'
  if (statuses.some(server => server.name === 'cua_repl' && server.tools.has('js'))) return undefined
  return '本轮 Codex 未提供用于点击的 cua_repl 工具。可继续尝试已授权的只读接口，页面点击需要宿主提供原生浏览器连接。'
}

/** 给已明确返回的动态节点失败生成可恢复标题；未知失败仍保留通用标题。 */
export function computerUseFailureTitle(toolName: string, output: unknown): string | undefined {
  if (!/^cua_repl(?:\/|$)/i.test(toolName)) return undefined
  const text = typeof output === 'string' ? output : JSON.stringify(output ?? '')
  if (/The browser access host is unavailable/i.test(text)) {
    return `${toolName} · 官方浏览器宿主未连接`
  }
  if (!DETACHED_NODE_PATTERN.test(text)) return undefined
  return `${toolName} · 页面节点已刷新，需重新定位后重试`
}
