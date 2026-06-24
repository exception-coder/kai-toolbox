import { randomUUID } from 'node:crypto'
import { resolve, sep } from 'node:path'

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

/** demo 沙箱内受限的文件工具：仅允许目标落在副本根内。 */
const DEMO_FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Read', 'Glob', 'Grep'])
/** demo 唯一放行的数据工具（in-process MCP，受后端表白名单二次把关）。 */
const DEMO_DB_TOOL = 'mcp__welfare_db__exec'

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
  /** demo 沙箱模式：开启后忽略 mode，按白名单 deny-by-default 硬裁决，不弹人工审批。 */
  private demo = false
  private allowRoot = ''

  constructor(private emit: Emit) {
    this.timeoutMs = Number(process.env.CLAUDE_CHAT_DECISION_TIMEOUT_MS) || 5 * 60 * 1000
  }

  /** 同步会话权限模式（运行中切换下一次工具调用即生效）。 */
  setMode(mode: string): void {
    this.mode = mode || 'default'
  }

  /** 开启 demo 沙箱裁决：allowRoot = 副本根（= 会话 cwd）。 */
  setDemo(allowRoot: string): void {
    this.demo = true
    this.allowRoot = resolve(allowRoot)
  }

  /** demo 沙箱裁决：编辑/读限副本根内，welfare_db 放行，其余一律拒。不弹审批。 */
  private demoDecision(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
    if (toolName === DEMO_DB_TOOL) {
      return { behavior: 'allow', updatedInput: input }
    }
    if (DEMO_FILE_TOOLS.has(toolName)) {
      const target = (input.file_path ?? input.notebook_path ?? input.path) as string | undefined
      // Glob/Grep 不带 path 时默认作用于 cwd（= 副本根），放行。
      if (!target || this.within(target)) {
        return { behavior: 'allow', updatedInput: input }
      }
    }
    return { behavior: 'deny', message: '演示模式仅允许在副本沙箱内操作福利签收模块（welfare-sign）' }
  }

  /** 目标路径归一化后必须落在副本根内，挡掉 ../ 与绝对路径逃逸。 */
  private within(p: string): boolean {
    const abs = resolve(this.allowRoot, p)
    return abs === this.allowRoot || abs.startsWith(this.allowRoot + sep)
  }

  // 传给 query({ options: { canUseTool } })
  canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { signal?: AbortSignal },
  ): Promise<Record<string, unknown>> => {
    // demo 沙箱：同步硬裁决，绝不发请求/等审批（公开演示无人审批）。
    if (this.demo) {
      return this.demoDecision(toolName, input)
    }
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
    if (!decision) {
      // 决策为空 = 超时或会话中断：多半是前台页面不在线没收到弹窗，给出可操作提示而非含糊的「拒绝」。
      return { behavior: 'deny', message: '等待确认超时（页面可能不在线），请回到对话重新下发指令' }
    }
    if (decision.behavior !== 'allow') {
      return { behavior: 'deny', message: decision.message ?? '用户已拒绝' }
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
