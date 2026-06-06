import { existsSync } from 'node:fs'
import { Codex, type ApprovalMode, type SandboxMode, type ThreadItem, type ThreadOptions } from '@openai/codex-sdk'

/** 单次 Codex 轮次所需上下文，由 Session 注入；emit 复用与 Claude 相同的统一事件协议。 */
export interface CodexTurnCtx {
  text: string
  cwd: string
  model?: string
  /** 会话权限模式（与 Claude 共用四档），映射为 Codex 的 approvalPolicy + sandboxMode。 */
  permissionMode: string
  /** 已有 thread id（resume 续跑）；无则新建线程。 */
  sdkSessionId?: string
  signal: AbortSignal
  emit: (e: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
}

// 复用本机 ~/.codex 认证；SDK 内部用 @openai/codex 自带二进制，无需 codex 在 PATH。
const codex = new Codex()

/** 四档权限模式 → Codex 策略。Codex 无交互式逐工具审批，故靠 sandbox + approvalPolicy 兜底。 */
function mapMode(mode: string): { approvalPolicy: ApprovalMode; sandboxMode: SandboxMode } {
  switch (mode) {
    case 'plan':
      return { approvalPolicy: 'never', sandboxMode: 'read-only' }
    case 'bypassPermissions':
      return { approvalPolicy: 'never', sandboxMode: 'danger-full-access' }
    default: // default / acceptEdits
      return { approvalPolicy: 'on-failure', sandboxMode: 'workspace-write' }
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
  }

  const thread = ctx.sdkSessionId ? codex.resumeThread(ctx.sdkSessionId, opts) : codex.startThread(opts)
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
