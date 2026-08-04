import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Codex,
  type ApprovalMode,
  type CodexOptions,
  type ErrorItem,
  type Input,
  type ModelReasoningEffort,
  type SandboxMode,
  type ThreadItem,
  type ThreadOptions,
  type WebSearchMode,
} from '@openai/codex-sdk'
import {
  CONSULT_READONLY_POLICY,
  CONSULT_READONLY_PROMPT,
  consultReadonlyCodexConfig,
} from './codexSecurity.js'
import { FORGE_PENDING_SQL_STEER } from './forgePendingSql.js'

export type CodexSpeed = 'default' | 'fast'

export const CODEX_TOOLBOX_MCP_SERVERS = ['forge', 'erp_db', 'erp_app', 'srm_db', 'srm_app', 'scm_db'] as const

/** Codex 没有 Claude 的 system/init 能力清单，供 sidecar 主动上报运行时注入的 MCP。 */
export function codexMcpCapabilities(toolPolicy: string, sessionId?: string): Array<{ name: string; status: string }> {
  if (!process.env.TOOLBOX_API_BASE || toolPolicy === 'disabled') return []
  if (toolPolicy === CONSULT_READONLY_POLICY) return [
    { name: 'consult-readonly', status: 'configured' },
    ...(sessionId ? [{ name: 'forge', status: 'configured' }] : []),
  ]
  return CODEX_TOOLBOX_MCP_SERVERS.map(name => ({ name, status: 'configured' }))
}

export interface CodexImageInput {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
}

/** 单次 Codex 轮次所需上下文，由 Session 注入；emit 复用与 Claude 相同的统一事件协议。 */
export interface CodexTurnCtx {
  /** 持久化 Vibe Coding 会话 id；one-shot 不传，避免把后台任务误登记为会话 SQL。 */
  sessionId?: string
  text: string
  cwd: string
  model?: string
  reasoningEffort?: ModelReasoningEffort
  speed?: CodexSpeed
  /** 会话权限模式（与 Claude 共用四档），映射为 Codex 的 approvalPolicy + sandboxMode。 */
  permissionMode: string
  /** 一次性分析任务的工具策略；disabled 强制只读沙箱并关闭网络。 */
  toolPolicy?: string
  /** 已有 thread id（resume 续跑）；无则新建线程。 */
  sdkSessionId?: string
  /** 第三方 OpenAI 兼容网关 baseURL；置则本轮走该网关（Codex 原生 OpenAI 协议，接网关更顺）。空=本机 ~/.codex 登录。 */
  apiBaseUrl?: string
  /** 第三方网关 API Key（走 OpenAI 鉴权）。 */
  authToken?: string
  /** Codex 官方登录配置根目录；空值使用默认 ~/.codex。 */
  codexHome?: string
  /** 一次性任务的图片；sidecar 会转临时文件并以 local_image 交给 Codex SDK。 */
  images?: CodexImageInput[]
  signal: AbortSignal
  emit: (e: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
}

// 官方实例：复用本机 ~/.codex 认证；SDK 内部用 @openai/codex 自带二进制，无需 codex 在 PATH。
const codexClients = new Map<string, Codex>()
// 第三方网关实例按 baseUrl 缓存，避免每轮重建。
const gatewayClients = new Map<string, Codex>()

/** OpenAI 习惯的 base：通常以 /v1 结尾；网关档案常只填 host（如 https://4sapi.com），这里补 /v1。 */
function normalizeOpenAiBase(base: string): string {
  const b = base.trim().replace(/\/+$/, '')
  return /\/v\d+$/.test(b) ? b : b + '/v1'
}

/** 取本轮用的 Codex 实例：配了网关→（缓存的）带 baseUrl+apiKey 的实例；否则官方实例。 */
function normalizeCodexHome(value?: string): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  const expanded = raw
    .replace(/^~(?=[\\/]|$)/, homedir())
    .replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`)
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, name: string) => process.env[name] ?? `$env:${name}`)
  return resolve(expanded)
}

function codexEnv(codexHome: string): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  // sidecar 可能由另一个 Codex 终端启动；不能把父会话身份/内部托管权限继承给业务咨询子进程。
  delete env.CODEX_THREAD_ID
  delete env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE
  env.CODEX_HOME = codexHome
  return env
}

function standardToolboxMcpConfig(sessionId?: string): NonNullable<CodexOptions['config']> {
  const apiBase = process.env.TOOLBOX_API_BASE?.trim()
  if (!apiBase) return {}
  const here = dirname(fileURLToPath(import.meta.url))
  const compiledBridge = join(here, 'toolboxMcpBridge.js')
  const sourceBridge = join(here, 'toolboxMcpBridge.ts')
  const bridge = existsSync(compiledBridge) ? compiledBridge : sourceBridge
  const enabledServers = CODEX_TOOLBOX_MCP_SERVERS.filter(name => name !== 'forge' || !!sessionId)
  const mcpServers = Object.fromEntries(enabledServers.map(name => [name, {
    command: process.execPath,
    args: bridge === sourceBridge ? ['--experimental-strip-types', bridge, name] : [bridge, name],
    env: {
      TOOLBOX_API_BASE: apiBase,
      ...(name === 'forge' && sessionId ? { TOOLBOX_SESSION_ID: sessionId } : {}),
    },
    enabled: true,
    required: true,
    // 查询库自动放行；应用探测可能写测试数据，沿用 Codex 的写操作审批。
    default_tools_approval_mode: name.endsWith('_db') || name === 'forge' ? 'auto' : 'writes',
  }]))
  return { mcp_servers: mcpServers }
}

function buildCodexConfig(speed: CodexSpeed, toolPolicy: string, codexHome?: string,
                          sessionId?: string): NonNullable<CodexOptions['config']> {
  const developerInstructions = toolPolicy === CONSULT_READONLY_POLICY
    ? CONSULT_READONLY_PROMPT
    : toolPolicy !== 'disabled' && sessionId
      ? FORGE_PENDING_SQL_STEER
      : undefined
  return {
    ...(speed === 'fast' ? { service_tier: 'priority' } : {}),
    ...(developerInstructions ? { developer_instructions: developerInstructions } : {}),
    ...(toolPolicy === CONSULT_READONLY_POLICY
      ? consultReadonlyCodexConfig(codexHome, sessionId)
      : toolPolicy === 'disabled'
        ? {}
        : standardToolboxMcpConfig(sessionId)),
  }
}

function pickCodex(
  apiBaseUrl?: string,
  authToken?: string,
  speed: CodexSpeed = 'default',
  codexHome?: string,
  toolPolicy = 'default',
  sessionId?: string,
): Codex {
  if (!apiBaseUrl || !apiBaseUrl.trim()) {
    const home = normalizeCodexHome(codexHome)
    const key = `${speed} ${home ?? '<default>'} ${toolPolicy} ${sessionId ?? '<one-shot>'}`
    let client = codexClients.get(key)
    if (!client) {
      const config = buildCodexConfig(speed, toolPolicy, home, sessionId)
      client = new Codex({
        ...(home ? { env: codexEnv(home) } : {}),
        ...(Object.keys(config).length ? { config } : {}),
      })
      codexClients.set(key, client)
    }
    return client
  }
  const baseUrl = normalizeOpenAiBase(apiBaseUrl)
  const key = baseUrl + ' ' + (authToken ?? '') + ' ' + speed + ' ' + toolPolicy + ' ' + (sessionId ?? '<one-shot>')
  let c = gatewayClients.get(key)
  if (!c) {
    const config = buildCodexConfig(speed, toolPolicy, normalizeCodexHome(codexHome), sessionId)
    c = new Codex({
      baseUrl,
      apiKey: authToken || undefined,
      ...(Object.keys(config).length ? { config } : {}),
    })
    gatewayClients.set(key, c)
  }
  return c
}

// Windows 上 Codex 的 OS 沙箱(workspace-write / read-only)靠 CreateProcessAsUserW 以受限令牌起子进程，
// 而普通交互用户进程默认不持有 SeAssignPrimaryTokenPrivilege → 必失败：
//   `windows sandbox: runner error: CreateProcessAsUserW failed: 5`(拒绝访问)，
// 任何 shell/文件命令都跑不起来。Codex 的 Windows 沙箱本就为实验性、不可靠。
// 本平台是本机单用户无鉴权工具箱：Windows 上一律关掉 OS 沙箱(danger-full-access)，
// 审批语义交回 approvalPolicy 兜底；非 Windows 维持原沙箱分级不变。
const IS_WINDOWS = process.platform === 'win32'

/** 四档权限模式 → Codex 策略。Codex 无交互式逐工具审批，故靠 sandbox + approvalPolicy 兜底。 */
function mapMode(mode: string): { approvalPolicy: ApprovalMode; sandboxMode: SandboxMode } {
  switch (mode) {
    case 'plan':
      return { approvalPolicy: 'never', sandboxMode: IS_WINDOWS ? 'danger-full-access' : 'read-only' }
    case 'bypassPermissions':
      return { approvalPolicy: 'never', sandboxMode: 'danger-full-access' }
    default: // default / acceptEdits
      return { approvalPolicy: 'on-failure', sandboxMode: IS_WINDOWS ? 'danger-full-access' : 'workspace-write' }
  }
}

/** 跑一轮 Codex：建/resume thread → runStreamed → 把 ThreadEvent 翻译成统一协议事件。 */
export async function runCodexTurn(ctx: CodexTurnCtx): Promise<void> {
  const safeCwd = existsSync(ctx.cwd) ? ctx.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
  const home = normalizeCodexHome(ctx.codexHome)
  if (home && !existsSync(home)) {
    ctx.emit({
      type: 'error',
      code: 'CODEX_HOME_NOT_FOUND',
      message: `Codex 授权目录不存在：${home}。请先创建目录并在该 CODEX_HOME 下执行 codex login。`,
    })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
    return
  }
  const toolsDisabled = ctx.toolPolicy === 'disabled'
  const consultReadonly = ctx.toolPolicy === CONSULT_READONLY_POLICY
  const { approvalPolicy, sandboxMode } = toolsDisabled || consultReadonly
    ? { approvalPolicy: 'never' as ApprovalMode, sandboxMode: 'read-only' as SandboxMode }
    : mapMode(ctx.permissionMode)
  const opts: ThreadOptions = {
    workingDirectory: safeCwd,
    skipGitRepoCheck: true,
    approvalPolicy,
    sandboxMode,
    model: ctx.model || undefined,
    modelReasoningEffort: ctx.reasoningEffort,
    ...(toolsDisabled || consultReadonly
      ? { networkAccessEnabled: false, webSearchMode: 'disabled' as WebSearchMode }
      : {}),
  }

  // agent_message 是全量文本，前端 assistantDelta 语义为累加 → 按 item id 记录已发文本，只发增量
  const lastText = new Map<string, string>()
  let tempImageDir: string | undefined

  try {
    const prepared = prepareCodexInput(ctx.text, ctx.images)
    tempImageDir = prepared.tempDir
    const client = pickCodex(ctx.apiBaseUrl, ctx.authToken, ctx.speed, home, ctx.toolPolicy, ctx.sessionId)
    if (ctx.apiBaseUrl) {
      console.log(`[sidecar] codex turn start model=${ctx.model ?? '默认'} via=${normalizeOpenAiBase(ctx.apiBaseUrl)}`)
    }
    const thread = ctx.sdkSessionId ? client.resumeThread(ctx.sdkSessionId, opts) : client.startThread(opts)
    const { events } = await thread.runStreamed(prepared.input, { signal: ctx.signal })
    for await (const ev of events) {
      switch (ev.type) {
        case 'thread.started':
          if (ev.thread_id) {
            ctx.setSdkSessionId(ev.thread_id)
            ctx.emit({
              type: 'init',
              sdkSessionId: ev.thread_id,
              mcpServers: codexMcpCapabilities(ctx.toolPolicy ?? 'default', ctx.sessionId),
            })
          }
          break
        case 'item.started':
        case 'item.updated':
        case 'item.completed':
          handleItem(ev.type, ev.item, ctx, lastText)
          break
        case 'turn.completed':
          // 调用诊断：Codex 不单独上报响应模型，请求模型即用模型；viaGateway 标识是否经第三方网关
          ctx.emit({
            type: 'turnInfo',
            requestedModel: ctx.model ?? null,
            responseModel: ctx.model ?? null,
            viaGateway: !!ctx.apiBaseUrl,
            baseUrl: ctx.apiBaseUrl ? normalizeOpenAiBase(ctx.apiBaseUrl) : null,
          })
          ctx.emit({ type: 'result', usage: ev.usage ?? {}, stopReason: 'end_turn' })
          break
        case 'turn.failed':
          ctx.emit({ type: 'error', code: 'CODEX_TURN_FAILED', message: ev.error?.message ?? 'Codex 轮次失败' })
          break
        case 'error':
          ctx.emit({ type: 'error', code: 'CODEX_ERROR', message: ev.message })
          break
      }
    }
  } catch (e: unknown) {
    if (ctx.signal.aborted) {
      ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
      return
    }
    ctx.emit({ type: 'error', code: 'CODEX_QUERY_FAILED', message: e instanceof Error ? e.message : String(e) })
  } finally {
    if (tempImageDir) rmSync(tempImageDir, { recursive: true, force: true })
  }
}

function prepareCodexInput(text: string, images?: CodexImageInput[]): { input: Input; tempDir?: string } {
  if (!images?.length) return { input: text }
  const tempDir = mkdtempSync(join(tmpdir(), 'kai-toolbox-codex-images-'))
  const input: Input = [{ type: 'text', text }]
  try {
    images.forEach((image, index) => {
      const ext = image.mediaType === 'image/jpeg' ? 'jpg' : image.mediaType.split('/')[1]
      const path = join(tempDir, `image-${index + 1}.${ext}`)
      writeFileSync(path, Buffer.from(image.data, 'base64'))
      input.push({ type: 'local_image', path })
    })
    return { input, tempDir }
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true })
    throw error
  }
}

function handleItem(
  phase: 'item.started' | 'item.updated' | 'item.completed',
  item: ThreadItem,
  ctx: CodexTurnCtx,
  lastText: Map<string, string>,
): void {
  switch (item.type) {
    case 'agent_message': {
      const prev = lastText.get(item.id) ?? ''
      const full = item.text ?? ''
      if (full.length > prev.length) {
        ctx.emit({ type: 'assistantDelta', text: full.slice(prev.length) })
        lastText.set(item.id, full)
      }
      break
    }
    case 'reasoning':
      // v1 忽略思维链
      break
    case 'command_execution':
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolName: 'shell', input: { command: item.command } })
      } else if (phase === 'item.completed') {
        ctx.emit({ type: 'toolResult', toolName: 'shell', output: item.aggregated_output ?? '', isError: item.status === 'failed' })
      }
      break
    case 'file_change':
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolName: 'edit', input: { changes: item.changes } })
      } else if (phase === 'item.completed') {
        const summary = (item.changes ?? []).map(c => `${c.kind} ${c.path}`).join('\n')
        ctx.emit({ type: 'toolResult', toolName: 'edit', output: summary, isError: item.status === 'failed' })
      }
      break
    case 'mcp_tool_call': {
      const label = `${item.server}/${item.tool}`
      // 咨询会话可用的外部 MCP 已在创建 Codex 客户端时通过配置禁用/注入。
      // 此处只负责展示 SDK 事件；内置技能读取也可能以上报内部 server 名称，
      // 因此不能再按 server 名称制造一条“拒绝调用”的错误消息。
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolName: label, input: item.arguments })
      } else if (phase === 'item.completed') {
        const output = item.error?.message ?? safeStringify(item.result)
        ctx.emit({ type: 'toolResult', toolName: label, output, isError: item.status === 'failed' })
      }
      break
    }
    case 'web_search':
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolName: 'web_search', input: { query: item.query } })
      }
      break
    case 'error':
      handleNonFatalErrorItem(phase, item, ctx)
      break
    // todo_list：v1 忽略
  }
}

/**
 * Codex SDK 将 ErrorItem 明确定义为 non-fatal；真正不可恢复的错误由 turn.failed
 * 或顶层 ThreadErrorEvent(type=error) 表达。独立命名该转换，避免与顶层致命 error 混淆。
 */
function handleNonFatalErrorItem(
  phase: 'item.started' | 'item.updated' | 'item.completed',
  item: ErrorItem,
  ctx: CodexTurnCtx,
): void {
  if (phase !== 'item.completed') return
  ctx.emit({ type: 'warning', code: 'CODEX_NON_FATAL_ITEM_ERROR', message: item.message })
}

function safeStringify(v: unknown): string {
  if (v == null) return ''
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return s.length > 4000 ? s.slice(0, 4000) + '…(truncated)' : s
  } catch {
    return String(v)
  }
}
