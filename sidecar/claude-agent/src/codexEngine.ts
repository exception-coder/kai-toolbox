import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
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
  REVIEW_ONLY_POLICY,
  REVIEW_ONLY_PROMPT,
  consultReadonlyRequiredMcpTools,
  consultReadonlyCodexConfig,
  reviewOnlyCodexConfig,
} from './codexSecurity.js'
import { FORGE_PENDING_SQL_STEER } from './forgePendingSql.js'
import {
  CodexAppServerTurnError,
  deleteCodexThread,
  latestCodexTurnId,
  runCodexAppServerTurn,
} from './codexAppServer.js'
import { activityOutputTail, emitToolActivity, summarizeToolInput } from './toolActivity.js'
import { classifyCommandResult } from './commandExecution.js'
import { appendWindowsExecutionInstructions } from './windowsExecution.js'

export type CodexSpeed = 'default' | 'fast'
export type CodexReasoningEffort = string
type CodexTransport = 'appServer' | 'sdkFallback' | 'thirdPartySdk'

export const CODEX_TOOLBOX_MCP_SERVERS = ['forge', 'erp_db', 'erp_app', 'srm_db', 'srm_app', 'scm_db'] as const

/** Codex 没有 Claude 的 system/init 能力清单，供 sidecar 主动上报运行时注入的 MCP。 */
export function codexMcpCapabilities(toolPolicy: string, sessionId?: string): Array<{ name: string; status: string }> {
  if (toolPolicy === 'disabled' || toolPolicy === REVIEW_ONLY_POLICY) return []
  if (toolPolicy === CONSULT_READONLY_POLICY) return [
    { name: 'consult-readonly', status: 'configured' },
    ...(process.env.TOOLBOX_API_BASE && sessionId ? [{ name: 'forge', status: 'configured' }] : []),
  ]
  if (!process.env.TOOLBOX_API_BASE) return []
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
  reasoningEffort?: CodexReasoningEffort
  speed?: CodexSpeed
  /** 会话权限模式，Codex 对外展示三档并映射为 approvalPolicy + sandboxMode。 */
  permissionMode: string
  /** 一次性分析任务的工具策略；disabled 强制只读沙箱并关闭网络。 */
  toolPolicy?: string
  /** 平台生成、仅供模型使用的本轮约束；只在 consult-readonly 会话中接收。 */
  developerInstructions?: string
  /** 后端在咨询创建时固化的可读证据系统；不允许模型自行扩展。 */
  consultEvidenceSystems?: string[]
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
export function normalizeCodexHome(value?: string): string | undefined {
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
                          sessionId?: string,
                          turnDeveloperInstructions?: string,
                          sourceRoot?: string,
                          consultEvidenceSystems: readonly string[] = []): NonNullable<CodexOptions['config']> {
  const baseDeveloperInstructions = [
    toolPolicy === CONSULT_READONLY_POLICY ? CONSULT_READONLY_PROMPT : undefined,
    toolPolicy === REVIEW_ONLY_POLICY ? REVIEW_ONLY_PROMPT : undefined,
    toolPolicy !== 'disabled' && toolPolicy !== REVIEW_ONLY_POLICY && sessionId ? FORGE_PENDING_SQL_STEER : undefined,
  ].filter(Boolean).join('\n\n') || undefined
  const developerInstructions = appendWindowsExecutionInstructions([
    baseDeveloperInstructions,
    toolPolicy === CONSULT_READONLY_POLICY || toolPolicy === REVIEW_ONLY_POLICY ? turnDeveloperInstructions?.trim() : undefined,
  ].filter(Boolean).join('\n\n'))
  return {
    ...(speed === 'fast' ? { service_tier: 'priority' } : {}),
    ...(developerInstructions ? { developer_instructions: developerInstructions } : {}),
    ...(toolPolicy === CONSULT_READONLY_POLICY
      ? consultReadonlyCodexConfig(codexHome, sessionId, sourceRoot, consultEvidenceSystems)
      : toolPolicy === REVIEW_ONLY_POLICY
        ? reviewOnlyCodexConfig(codexHome)
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
  developerInstructions?: string,
  sourceRoot?: string,
  consultEvidenceSystems: readonly string[] = [],
): Codex {
  if (!apiBaseUrl || !apiBaseUrl.trim()) {
    const home = normalizeCodexHome(codexHome)
    const config = buildCodexConfig(speed, toolPolicy, home, sessionId, developerInstructions, sourceRoot, consultEvidenceSystems)
    if (developerInstructions) {
      return new Codex({
        ...(home ? { env: codexEnv(home) } : {}),
        ...(Object.keys(config).length ? { config } : {}),
      })
    }
    const key = `${speed} ${home ?? '<default>'} ${toolPolicy} ${sessionId ?? '<one-shot>'} ${sourceRoot ?? '<no-source>'} ${[...consultEvidenceSystems].sort().join(',')}`
    let client = codexClients.get(key)
    if (!client) {
      client = new Codex({
        ...(home ? { env: codexEnv(home) } : {}),
        ...(Object.keys(config).length ? { config } : {}),
      })
      codexClients.set(key, client)
    }
    return client
  }
  const baseUrl = normalizeOpenAiBase(apiBaseUrl)
  const config = buildCodexConfig(
    speed,
    toolPolicy,
    normalizeCodexHome(codexHome),
    sessionId,
    developerInstructions,
    sourceRoot,
    consultEvidenceSystems,
  )
  if (developerInstructions) {
    return new Codex({
      baseUrl,
      apiKey: authToken || undefined,
      ...(Object.keys(config).length ? { config } : {}),
    })
  }
  const key = baseUrl + ' ' + (authToken ?? '') + ' ' + speed + ' ' + toolPolicy + ' ' + (sessionId ?? '<one-shot>')
    + ' ' + [...consultEvidenceSystems].sort().join(',')
  let c = gatewayClients.get(key)
  if (!c) {
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

/** Codex 三档权限模式 → 执行策略；plan 仅兼容历史会话，不在 Codex UI 中展示。 */
function mapMode(mode: string): { approvalPolicy: ApprovalMode; sandboxMode: SandboxMode } {
  switch (mode) {
    case 'plan':
      return { approvalPolicy: 'never', sandboxMode: IS_WINDOWS ? 'danger-full-access' : 'read-only' }
    case 'bypassPermissions':
      return { approvalPolicy: 'never', sandboxMode: 'danger-full-access' }
    case 'acceptEdits':
      return { approvalPolicy: 'untrusted', sandboxMode: IS_WINDOWS ? 'danger-full-access' : 'workspace-write' }
    default:
      return { approvalPolicy: 'on-request', sandboxMode: IS_WINDOWS ? 'danger-full-access' : 'workspace-write' }
  }
}

/**
 * 跑一轮 Codex。
 * 官方本机授权优先使用 App Server 获取完整流式事件；第三方 OpenAI 兼容网关固定使用 SDK。
 * App Server 仅在尚未产生可见输出或副作用时允许回退 SDK，避免同一轮重复执行。
 */
export async function runCodexTurn(ctx: CodexTurnCtx): Promise<void> {
  const safeCwd = existsSync(ctx.cwd) ? ctx.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
  const reviewOnly = ctx.toolPolicy === REVIEW_ONLY_POLICY
  if (reviewOnly && !isReviewWorkspace(safeCwd)) {
    ctx.emit({ type: 'error', code: 'REVIEW_WORKSPACE_FORBIDDEN', message: '计划评审工作目录不在隔离评审根目录内，已拒绝启动' })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
    return
  }
  if (ctx.apiBaseUrl?.trim()) {
    await runCodexSdkTurn(ctx, 'thirdPartySdk')
    return
  }

  const home = normalizeCodexHome(ctx.codexHome)
  if (!validateCodexHome(ctx, home)) return
  const toolsDisabled = ctx.toolPolicy === 'disabled' || ctx.toolPolicy === REVIEW_ONLY_POLICY
  const consultReadonly = ctx.toolPolicy === CONSULT_READONLY_POLICY
  const consultSourceRoot = consultReadonly && ctx.cwd.trim() ? resolve(ctx.cwd) : undefined
  const { approvalPolicy, sandboxMode } = reviewOnly
    ? { approvalPolicy: 'never' as ApprovalMode, sandboxMode: 'read-only' as SandboxMode }
    : toolsDisabled || consultReadonly
    ? { approvalPolicy: 'never' as ApprovalMode, sandboxMode: IS_WINDOWS ? 'danger-full-access' as SandboxMode : 'read-only' as SandboxMode }
    : mapMode(ctx.permissionMode)
  let tempImageDir: string | undefined

  try {
    const prepared = prepareCodexInput(ctx.text, ctx.images)
    tempImageDir = prepared.tempDir
    await runCodexAppServerTurn({
      threadId: ctx.sdkSessionId,
      cwd: safeCwd,
      model: ctx.model || undefined,
      reasoningEffort: ctx.reasoningEffort,
      sandbox: sandboxMode,
      approvalPolicy,
      config: buildCodexConfig(
        ctx.speed ?? 'default',
        ctx.toolPolicy ?? 'default',
        home,
        ctx.sessionId,
        ctx.developerInstructions,
        consultSourceRoot,
        ctx.consultEvidenceSystems,
      ),
      input: toAppServerInput(prepared.input),
      codexHome: home,
      signal: ctx.signal,
      emit: ctx.emit,
      setThreadId: ctx.setSdkSessionId,
      mcpServers: codexMcpCapabilities(ctx.toolPolicy ?? 'default', ctx.sessionId),
      requiredMcpTools: consultReadonly
        ? consultReadonlyRequiredMcpTools(consultSourceRoot, ctx.consultEvidenceSystems)
        : undefined,
      forbidMcpTools: reviewOnly,
    })
  } catch (error) {
    if (ctx.signal.aborted) {
      ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
      return
    }
    if (error instanceof CodexAppServerTurnError && error.retrySafe) {
      ctx.emit({
        type: 'warning',
        code: 'CODEX_APP_SERVER_FALLBACK',
        message: `Codex App Server 启动失败，已自动回退 SDK：${error.message}`,
      })
      await runCodexSdkTurn(ctx, 'sdkFallback')
      return
    }
    ctx.emit({
      type: 'error',
      code: 'CODEX_APP_SERVER_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
  } finally {
    if (tempImageDir) rmSync(tempImageDir, { recursive: true, force: true })
  }
}

export interface EphemeralCodexRuntime {
  runTurn: (ctx: CodexTurnCtx) => Promise<void>
  deleteThread: (threadId: string, codexHome?: string) => Promise<void>
  warn: (message: string) => void
}

const DEFAULT_EPHEMERAL_CODEX_RUNTIME: EphemeralCodexRuntime = {
  runTurn: runCodexTurn,
  deleteThread: deleteCodexThread,
  warn: message => console.warn(message),
}

/**
 * Runs a one-shot Codex task and permanently removes every native thread it created.
 * Cleanup is best-effort so a Codex housekeeping failure never changes the task result.
 */
export async function runEphemeralCodexTurn(
  ctx: CodexTurnCtx,
  runtime: EphemeralCodexRuntime = DEFAULT_EPHEMERAL_CODEX_RUNTIME,
): Promise<void> {
  const threadIds = new Set<string>()
  try {
    await runtime.runTurn({
      ...ctx,
      setSdkSessionId: threadId => {
        threadIds.add(threadId)
        ctx.setSdkSessionId(threadId)
      },
    })
  } finally {
    for (const threadId of threadIds) {
      try {
        await runtime.deleteThread(threadId, ctx.codexHome)
      } catch (error) {
        runtime.warn(`[sidecar] 删除 Codex 临时会话 ${threadId} 失败（忽略）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

function isReviewWorkspace(cwd: string): boolean {
  const root = resolve(homedir(), '.kai-toolbox', 'reviews')
  const candidate = resolve(cwd)
  const child = relative(root, candidate)
  return child.length > 0 && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(child)
}

async function runCodexSdkTurn(ctx: CodexTurnCtx, transport: CodexTransport): Promise<void> {
  const safeCwd = existsSync(ctx.cwd) ? ctx.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
  const home = normalizeCodexHome(ctx.codexHome)
  if (!validateCodexHome(ctx, home)) return
  const toolsDisabled = ctx.toolPolicy === 'disabled' || ctx.toolPolicy === REVIEW_ONLY_POLICY
  const consultReadonly = ctx.toolPolicy === CONSULT_READONLY_POLICY
  const reviewOnly = ctx.toolPolicy === REVIEW_ONLY_POLICY
  const consultSourceRoot = consultReadonly && ctx.cwd.trim() ? resolve(ctx.cwd) : undefined
  const { approvalPolicy, sandboxMode } = reviewOnly
    ? { approvalPolicy: 'never' as ApprovalMode, sandboxMode: 'read-only' as SandboxMode }
    : toolsDisabled || consultReadonly
    ? { approvalPolicy: 'never' as ApprovalMode, sandboxMode: IS_WINDOWS ? 'danger-full-access' as SandboxMode : 'read-only' as SandboxMode }
    : mapMode(ctx.permissionMode)
  const opts: ThreadOptions = {
    workingDirectory: safeCwd,
    skipGitRepoCheck: true,
    approvalPolicy,
    sandboxMode,
    model: ctx.model || undefined,
    modelReasoningEffort: ctx.reasoningEffort as ModelReasoningEffort | undefined,
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
    const client = pickCodex(
      ctx.apiBaseUrl,
      ctx.authToken,
      ctx.speed,
      home,
      ctx.toolPolicy,
      ctx.sessionId,
      ctx.developerInstructions,
      consultSourceRoot,
      ctx.consultEvidenceSystems,
    )
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
          // Codex exec JSON 事件不携带 turn id；从官方 App Server 读回最新 turn，
          // 挂到本轮最后一条回答上，供 thread/fork(lastTurnId) 精确分叉。
          if (thread.id) {
            try {
              const turnId = await latestCodexTurnId(thread.id, home)
              if (turnId) ctx.emit({ type: 'forkAnchor', anchor: turnId })
            } catch (error) {
              console.warn('[sidecar] 读取 Codex 分叉锚点失败：', error instanceof Error ? error.message : String(error))
            }
          }
          // 调用诊断：Codex 不单独上报响应模型，请求模型即用模型；viaGateway 标识是否经第三方网关
          ctx.emit({
            type: 'turnInfo',
            requestedModel: ctx.model ?? null,
            responseModel: ctx.model ?? null,
            viaGateway: !!ctx.apiBaseUrl,
            baseUrl: ctx.apiBaseUrl ? normalizeOpenAiBase(ctx.apiBaseUrl) : null,
            transport,
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

function validateCodexHome(ctx: CodexTurnCtx, home?: string): boolean {
  if (!home || existsSync(home)) return true
  ctx.emit({
    type: 'error',
    code: 'CODEX_HOME_NOT_FOUND',
    message: `Codex 授权目录不存在：${home}。请先创建目录并在该 CODEX_HOME 下执行 codex login。`,
  })
  ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
  return false
}

function toAppServerInput(input: Input): Array<Record<string, unknown>> {
  if (typeof input === 'string') return [{ type: 'text', text: input, text_elements: [] }]
  return input.map(item => item.type === 'local_image'
    ? { type: 'localImage', path: item.path }
    : { type: 'text', text: item.text, text_elements: [] })
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
      const commandResult = phase === 'item.completed'
        ? classifyCommandResult('shell', item.command, item.aggregated_output ?? '', item.status === 'failed')
        : undefined
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolCallId: item.id, toolName: 'shell', input: { command: item.command } })
      }
      emitToolActivity(ctx.emit, {
        toolCallId: item.id,
        toolName: 'shell',
        status: phase === 'item.completed' ? (item.status === 'failed' ? 'failed' : 'completed') : 'inProgress',
        title: phase === 'item.completed' ? commandResult?.title : '正在执行命令',
        detail: item.command,
        outputTail: tail(item.aggregated_output ?? '', 8_000) || undefined,
        outcome: commandResult?.outcome,
        severity: commandResult?.severity,
      })
      if (phase === 'item.completed') {
        ctx.emit({ type: 'toolResult', toolCallId: item.id, toolName: 'shell', output: item.aggregated_output ?? '', isError: item.status === 'failed' })
      }
      break
    case 'file_change':
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolCallId: item.id, toolName: 'edit', input: { changes: item.changes } })
      } else if (phase === 'item.completed') {
        const summary = (item.changes ?? []).map(c => `${c.kind} ${c.path}`).join('\n')
        ctx.emit({ type: 'toolResult', toolCallId: item.id, toolName: 'edit', output: summary, isError: item.status === 'failed' })
      }
      emitToolActivity(ctx.emit, {
        toolCallId: item.id,
        toolName: 'edit',
        status: phase === 'item.completed' ? (item.status === 'failed' ? 'failed' : 'completed') : 'inProgress',
        title: phase === 'item.completed' ? '文件编辑完成' : '正在编辑文件',
        outputTail: phase === 'item.completed' ? activityOutputTail(item.changes) : undefined,
      })
      break
    case 'mcp_tool_call': {
      const label = `${item.server}/${item.tool}`
      // 咨询会话可用的外部 MCP 已在创建 Codex 客户端时通过配置禁用/注入。
      // 此处只负责展示 SDK 事件；内置技能读取也可能以上报内部 server 名称，
      // 因此不能再按 server 名称制造一条“拒绝调用”的错误消息。
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolCallId: item.id, toolName: label, toolKind: 'mcp', input: item.arguments })
      } else if (phase === 'item.completed') {
        const output = item.error?.message ?? safeStringify(item.result)
        ctx.emit({ type: 'toolResult', toolCallId: item.id, toolName: label, toolKind: 'mcp', output, isError: item.status === 'failed' })
      }
      emitToolActivity(ctx.emit, {
        toolCallId: item.id,
        toolName: label,
        status: phase === 'item.completed' ? (item.status === 'failed' ? 'failed' : 'completed') : 'inProgress',
        detail: summarizeToolInput(item.arguments),
        outputTail: phase === 'item.completed' ? activityOutputTail(item.error?.message ?? item.result) : undefined,
      })
      break
    }
    case 'web_search':
      if (phase === 'item.started') {
        ctx.emit({ type: 'toolUse', toolCallId: item.id, toolName: 'web_search', input: { query: item.query } })
      } else if (phase === 'item.completed') {
        ctx.emit({ type: 'toolResult', toolCallId: item.id, toolName: 'web_search', output: item.query, isError: false })
      }
      emitToolActivity(ctx.emit, {
        toolCallId: item.id,
        toolName: 'web_search',
        status: phase === 'item.completed' ? 'completed' : 'inProgress',
        detail: summarizeToolInput({ query: item.query }),
      })
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

function tail(value: string, limit: number): string {
  return value.length > limit ? `…${value.slice(-(limit - 1))}` : value
}
