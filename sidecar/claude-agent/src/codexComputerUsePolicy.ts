import { VIBE_BROWSER_SERVER, VIBE_BROWSER_TOOL } from './vibeBrowser.js'

export const CODEX_COMPUTER_USE_RECOVERY_STEER = [
  '【浏览器动态节点恢复】使用 cua_repl 操作会实时刷新的页面时，可访问性节点编号只对最近一次页面快照有效。',
  '每次点击、输入、滚动或页面导航后，必须重新读取 getAXState，再从新快照定位下一目标；不得复用动作前的节点编号。',
  '若工具返回 Node is detached from document、节点不存在或执行上下文已销毁，立即重新读取页面状态并按目标语义重新定位，只重试该动作一次；禁止原样重复旧节点调用。',
  '只有 cua_repl 运行时本身不可用时才使用 js_reset；动态节点失效不需要重置运行时。',
  '【浏览器失败归因】历史对话中的“已禁用”“未装配”不代表本轮状态。以本轮实际工具调用结果为准；工具可见不等于浏览器已连接。',
  '【原生能力分层】App Server 是 Codex 执行通道，不保证每个浏览器宿主已连接。cua.getState 的 apps 与 browsers 是独立通道；浏览器宿主不可用不代表原生桌面 Computer Use 不可用。',
  '普通开发会话中，若本轮仅报告浏览器宿主不可用、没有权限拒绝，并返回了可用 apps，可按当前 cua 文档用 getApp 选择目标窗口继续已授权任务；先读窗口状态再操作，不需要额外安装插件。若 apps 也不可用，分别报告实际错误。',
  '宿主不可用时不得伪造或复制其他会话的 pipe、身份或访问凭据；不得以浏览器完成标记代替成功验收，最终回复要说明实际使用的通道与未完成项。咨询、评审仍遵守本轮工具及账号边界，不通过桌面扩大权限。',
  'The browser access host is unavailable 只证明浏览器宿主不可用；Local browser access is unavailable for this chat 只证明当前会话未获得本地浏览器访问权限。二者均不能推断成用户关闭了 Work 设置、管理员禁用、插件未安装或账号密码错误。',
  '仅当本轮工具明确指出某项设置或策略拒绝时才据此说明；原因不明确就报告实际失败，不编造开关位置、不要求用户反复更新重启。访问被拒绝时停止，不通过其他执行方式绕过拒绝。',
].join('\n')

const DETACHED_NODE_PATTERN = /node is detached from document|node (?:does not exist|not found)|execution context (?:was )?destroyed/i

const OFFICIAL_BROWSER_PLUGINS = ['browser@openai-bundled', 'chrome@openai-bundled',
  'unified-computer-use@openai-bundled'] as const

/** Presence is diagnostic only: it neither proves host reachability nor grants access. */
export function browserHostEnvironmentPresence(env: NodeJS.ProcessEnv): Record<string, boolean> {
  return Object.fromEntries(['BROWSER_USE_ACCESS_EXECUTOR_ID', 'BROWSER_USE_ACCESS_PIPE_PATH',
    'BROWSER_USE_ACCESS_VERIFYING_IDENTITY', 'CODEX_WINDOWS_REGISTERED_CORE']
    .map(key => [key, Boolean(env[key]?.trim())]))
}

/** Never log arbitrary tool output: it may contain credentials, page content or runtime instructions. */
export function browserToolDiagnostic(item: Record<string, unknown>): Record<string, unknown> | undefined {
  if (item.type !== 'mcpToolCall' || item.server !== 'cua_repl') return undefined
  const result = item.result as { content?: { type?: string; text?: string }[] } | undefined
  // Later blocks can contain generic runtime instructions mentioning unrelated errors.
  const texts = result?.content?.filter(block => block.type === 'text').map(block => block.text ?? '') ?? []
  const firstText = texts[0]
  // getState can return documentation first, then a JSON inventory. Inspect only
  // structured errors, never error examples embedded in later documentation.
  const inventory = texts.flatMap(text => {
    try {
      const value = JSON.parse(text)
      return value && Array.isArray(value.apps) && Array.isArray(value.browsers) ? [value] : []
    } catch { return [] }
  }).at(-1)
  const inventoryErrors = inventory && Array.isArray(inventory.errors)
    ? inventory.errors.filter((error: unknown): error is string => typeof error === 'string') : []
  const output = [typeof firstText === 'string' ? firstText : JSON.stringify(item.error ?? ''), ...inventoryErrors].join('\n')
  const nativeError = [
    'Local browser use is disabled in Work settings',
    'The browser access host is unavailable',
    'Local browser access is unavailable for this chat',
    'Cannot authenticate the browser access response',
    'Cannot verify browser access without the current turn',
  ].find(message => output.includes(message))
  return {
    tool: ['js', 'js_reset', 'turn_ended'].includes(String(item.tool)) ? item.tool : 'other',
    status: ['completed', 'failed', 'inProgress'].includes(String(item.status)) ? item.status : 'unknown',
    nativeError: nativeError ?? null,
    ...(inventory ? { desktopInventoryAvailable: inventory.apps.length > 0,
      browserInventoryAvailable: inventory.browsers.length > 0 } : {}),
    // Successful cleanup calls and RPC completion do not prove a browser action succeeded.
    browserActionVerified: false,
  }
}

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
  if (record(config.features).computer_use === false) {
    // A manually registered MCP can share the bundled plugin's name. Only override an
    // existing transport: Codex rejects a new MCP entry containing only enabled=false.
    const servers = { ...record(config.mcp_servers) }
    if (Object.hasOwn(record(effective.mcp_servers), 'cua_repl')) servers.cua_repl = { enabled: false }
    return { ...config, plugins, mcp_servers: servers }
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
  if (statuses.some(server => server.name === VIBE_BROWSER_SERVER && server.tools.has(VIBE_BROWSER_TOOL))) return undefined
  if (statuses.some(server => server.name === 'cua_repl' && server.tools.has('js'))) return undefined
  return '本轮 Codex 未提供用于点击的 cua_repl 工具。可继续尝试已授权的只读接口，页面点击需要宿主提供原生浏览器连接。'
}

/** 保留官方运行时的不同失败语义；未知原因不推断成配置禁用。 */
export function computerUseFailureTitle(toolName: string, output: unknown, desktopInventoryAvailable = false): string | undefined {
  if (!/^cua_repl(?:\/|$)/i.test(toolName)) return undefined
  const text = typeof output === 'string' ? output : JSON.stringify(output ?? '')
  if (/Local browser use is disabled in Work settings/i.test(text)) {
    return `${toolName} · 宿主明确拒绝本地浏览器访问（Work 设置）`
  }
  if (/The browser access host is unavailable/i.test(text)) {
    return `${toolName} · 官方浏览器宿主未连接${desktopInventoryAvailable ? '；原生桌面窗口可用' : ''}`
  }
  if (/Local browser access is unavailable for this chat/i.test(text)) {
    return `${toolName} · 当前会话未获得本地浏览器访问权限`
  }
  if (/Cannot authenticate the browser access response/i.test(text)) {
    return `${toolName} · 浏览器宿主响应身份校验失败`
  }
  if (!DETACHED_NODE_PATTERN.test(text)) return undefined
  return `${toolName} · 页面节点已刷新，需重新定位后重试`
}
