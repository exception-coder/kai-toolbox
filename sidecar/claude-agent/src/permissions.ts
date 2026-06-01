import { randomUUID } from 'node:crypto'

/** Java 回灌的决策。 */
export interface Decision {
  behavior: string // "allow" | "deny"
  updatedInput?: unknown
  answers?: Record<string, unknown>
  message?: string
}

type Emit = (event: Record<string, unknown>) => void

/** 编辑类工具：acceptEdits 模式下自动放行。 */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * 单会话的权限/提问交互。绑定到 query() 的 canUseTool 回调：
 * Claude 要用工具或调用 AskUserQuestion 时暂停，发结构化请求给 Java，阻塞等决策回灌。
 * 超时或会话中断一律按 deny —— 绝不静默放行。
 */
export class Permissions {
  private pending = new Map<string, (d: Decision | null) => void>()
  private readonly timeoutMs: number
  /** 当前会话权限模式，由 SessionManager 同步；canUseTool 据此决定是否自动放行。 */
  private mode = 'default'

  constructor(private emit: Emit) {
    this.timeoutMs = Number(process.env.CLAUDE_CHAT_DECISION_TIMEOUT_MS) || 5 * 60 * 1000
  }

  /** 同步会话权限模式（运行中切换下一次工具调用即生效）。 */
  setMode(mode: string): void {
    this.mode = mode || 'default'
  }

  // 传给 query({ options: { canUseTool } })
  canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { signal?: AbortSignal },
  ): Promise<Record<string, unknown>> => {
    // 权限模式自动放行：AskUserQuestion 永远要弹（用户必须作答），其余按当前模式。
    // SDK 一旦提供 canUseTool 就对每个工具调用触发它，permissionMode 不会绕过本回调，
    // 所以放行决策必须在这里做。
    if (toolName !== 'AskUserQuestion') {
      if (this.mode === 'bypassPermissions') {
        return { behavior: 'allow', updatedInput: input }
      }
      if (this.mode === 'acceptEdits' && EDIT_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }
    }

    const reqId = randomUUID()
    if (toolName === 'AskUserQuestion') {
      this.emit({ type: 'questionRequest', reqId, questions: (input?.questions as unknown) ?? [] })
    } else {
      this.emit({ type: 'permissionRequest', reqId, toolName, input })
    }

    const decision = await this.waitFor(reqId, opts?.signal)
    if (!decision || decision.behavior !== 'allow') {
      return { behavior: 'deny', message: decision?.message ?? '用户拒绝或超时' }
    }
    if (toolName === 'AskUserQuestion') {
      return { behavior: 'allow', updatedInput: { ...input, answers: decision.answers ?? {} } }
    }
    return { behavior: 'allow', updatedInput: decision.updatedInput ?? input }
  }

  /** Java 决策到达 */
  resolve(reqId: string, decision: Decision): void {
    const r = this.pending.get(reqId)
    if (r) r(decision)
  }

  /** 会话中断：把所有挂起的请求按 deny 释放 */
  rejectAll(): void {
    for (const r of this.pending.values()) r(null)
    this.pending.clear()
  }

  private waitFor(reqId: string, signal?: AbortSignal): Promise<Decision | null> {
    return new Promise((resolve) => {
      const done = (d: Decision | null) => {
        clearTimeout(timer)
        this.pending.delete(reqId)
        resolve(d)
      }
      const timer = setTimeout(() => done(null), this.timeoutMs)
      this.pending.set(reqId, done)
      if (signal) signal.addEventListener('abort', () => done(null), { once: true })
    })
  }
}
