import { existsSync } from 'node:fs'
import { Codex, type ApprovalMode, type ModelReasoningEffort, type SandboxMode, type ThreadItem, type ThreadOptions } from '@openai/codex-sdk'

export type CodexSpeed = 'default' | 'fast'

/** 单次 Codex 轮次所需上下文，由 Session 注入；emit 复用与 Claude 相同的统一事件协议。 */
export interface CodexTurnCtx {
  text: string
  cwd: string
  model?: string
  reasoningEffort?: ModelReasoningEffort
  speed?: CodexSpeed
  /** 会话权限模式（与 Claude 共用四档），映射为 Codex 的 approvalPolicy + sandboxMode。 */
  permissionMode: string
  /** 已有 thread id（resume 续跑）；无则新建线程。 */
  sdkSessionId?: string
  /** 第三方 OpenAI 兼容网关 baseURL；置则本轮走该网关（Codex 原生 OpenAI 协议，接网关更顺）。空=本机 ~/.codex 登录。 */
  apiBaseUrl?: string
  /** 第三方网关 API Key（走 OpenAI 鉴权）。 */
  authToken?: string
  signal: AbortSignal
  emit: (e: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
}

// 官方实例：复用本机 ~/.codex 认证；SDK 内部用 @openai/codex 自带二进制，无需 codex 在 PATH。
const codexClients = new Map<CodexSpeed, Codex>()
// 第三方网关实例按 baseUrl 缓存，避免每轮重建。
const gatewayClients = new Map<string, Codex>()

/** OpenAI 习惯的 base：通常以 /v1 结尾；网关档案常只填 host（如 https://4sapi.com），这里补 /v1。 */
function normalizeOpenAiBase(base: string): string {
  const b = base.trim().replace(/\/+$/, '')
  return /\/v\d+$/.test(b) ? b : b + '/v1'
}

/** 取本轮用的 Codex 实例：配了网关→（缓存的）带 baseUrl+apiKey 的实例；否则官方实例。 */
function pickCodex(apiBaseUrl?: string, authToken?: string, speed: CodexSpeed = 'default'): Codex {
  if (!apiBaseUrl || !apiBaseUrl.trim()) {
    let client = codexClients.get(speed)
    if (!client) {
      client = new Codex(speed === 'fast' ? { config: { service_tier: 'priority' } } : undefined)
      codexClients.set(speed, client)
    }
    return client
  }
  const baseUrl = normalizeOpenAiBase(apiBaseUrl)
  const key = baseUrl + ' ' + (authToken ?? '') + ' ' + speed
  let c = gatewayClients.get(key)
  if (!c) {
    c = new Codex({
      baseUrl,
      apiKey: authToken || undefined,
      ...(speed === 'fast' ? { config: { service_tier: 'priority' } } : {}),
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
  const { approvalPolicy, sandboxMode } = mapMode(ctx.permissionMode)
  const opts: ThreadOptions = {
    workingDirectory: safeCwd,
    skipGitRepoCheck: true,
    approvalPolicy,
    sandboxMode,
    model: ctx.model || undefined,
    modelReasoningEffort: ctx.reasoningEffort,
  }

  const client = pickCodex(ctx.apiBaseUrl, ctx.authToken, ctx.speed)
  if (ctx.apiBaseUrl) {
    console.log(`[sidecar] codex turn start model=${ctx.model ?? '默认'} via=${normalizeOpenAiBase(ctx.apiBaseUrl)}`)
  }
  const thread = ctx.sdkSessionId ? client.resumeThread(ctx.sdkSessionId, opts) : client.startThread(opts)
  // agent_message 是全量文本，前端 assistantDelta 语义为累加 → 按 item id 记录已发文本，只发增量
  const lastText = new Map<string, string>()

  try {
    const { events } = await thread.runStreamed(ctx.text, { signal: ctx.signal })
    for await (const ev of events) {
      switch (ev.type) {
        case 'thread.started':
          if (ev.thread_id) {
            ctx.setSdkSessionId(ev.thread_id)
            ctx.emit({ type: 'init', sdkSessionId: ev.thread_id })
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
      ctx.emit({ type: 'error', code: 'CODEX_ITEM_ERROR', message: item.message })
      break
    // todo_list：v1 忽略
  }
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
