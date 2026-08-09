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
/** 只写 Forge 本地台账、不执行数据库的安全工具；普通开发会话无需弹审批。 */
const FORGE_SAFE_TOOLS = new Set(['mcp__forge__register_pending_sql'])

/** 业务咨询只读策略：内置工具只开放读能力；MCP 也必须命中明确的只读白名单。 */
const CONSULT_READ_TOOLS = new Set(['Read'])
const CONSULT_READONLY_MCP_TOOLS = new Set([
  'mcp__erp_db__query',
  'mcp__srm_db__query',
  'mcp__scm_db__query',
  'mcp__consult-readonly__erp_db_query',
  'mcp__consult-readonly__srm_db_query',
  'mcp__consult-readonly__scm_db_query',
  'mcp__consult-readonly__source_context',
  'mcp__consult-readonly__source_search',
  'mcp__consult-readonly__source_read',
  'mcp__consult-readonly__erp_standby_schema_search',
  'mcp__consult-readonly__erp_standby_validate_sql',
])
const CONSULT_READONLY_MCP_PREFIXES = [
  'mcp__domain-knowledge__',
  'mcp__cross-topology__',
]

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
  /** 服务端下发的能力边界；consult-readonly 优先于 mode/autoApprove，不能被前端放宽。 */
  private toolPolicy = 'default'
  /**
   * 「弹窗自动允许」兜底开关，与 mode 相互独立。
   *
   * 原先这是纯前端的 useEffect：收到 permissionRequest 就自动 decide(allow)。问题是这个决策
   * 本来不需要人参与，却被绑死在「浏览器页面必须活着且在前台」上——用户切到别的页面（组件卸载或被
   * 浏览器后台节流）、或干脆没开页面时，自动放行就不生效了：请求一路挂到 5 分钟超时 deny，
   * 或在此期间遇上中断/sidecar 重建，直接变成 CLI 的 tool permission stream closed。
   *
   * 下沉到这里后，裁决在 sidecar 内同步完成，不发请求、不等任何网络回程，与浏览器在不在线彻底解耦。
   */
  private autoApprove = false
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

  setToolPolicy(policy: string): void {
    this.toolPolicy = policy === 'consult-readonly' ? 'consult-readonly' : 'default'
  }

  /** 同步「弹窗自动允许」兜底开关（运行中切换下一次工具调用即生效）。 */
  setAutoApprove(on: boolean): void {
    this.autoApprove = !!on
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

  private consultReadonlyDecision(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
    if (FORGE_SAFE_TOOLS.has(toolName)
      || CONSULT_READ_TOOLS.has(toolName)
      || CONSULT_READONLY_MCP_TOOLS.has(toolName)
      || CONSULT_READONLY_MCP_PREFIXES.some(prefix => toolName.startsWith(prefix))) {
      return { behavior: 'allow', updatedInput: input }
    }
    return {
      behavior: 'deny',
      message: `业务咨询为只读会话，禁止调用写入或命令工具：${toolName}`,
    }
  }

  // 传给 query({ options: { canUseTool } })
  canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    opts: { signal?: AbortSignal },
  ): Promise<Record<string, unknown>> => {
    // demo 沙箱：除 AskUserQuestion 外同步硬裁决，绝不发请求/等审批（公开演示无人审批，全自动）。
    // AskUserQuestion 例外——必须让用户作答，走下方正常「发 questionRequest + 等决策回灌」路径。
    if (this.demo && toolName !== 'AskUserQuestion') {
      return this.demoDecision(toolName, input)
    }
    // 服务端硬策略优先于 bypassPermissions/autoApprove。AskUserQuestion 仍走正常问答交互。
    if (this.toolPolicy === 'consult-readonly' && toolName !== 'AskUserQuestion') {
      return this.consultReadonlyDecision(toolName, input)
    }
    if (FORGE_SAFE_TOOLS.has(toolName)) {
      return { behavior: 'allow', updatedInput: input }
    }
    // 权限模式自动放行：AskUserQuestion 永远要弹（用户必须作答），其余按当前模式。
    // SDK 一旦提供 canUseTool 就对每个工具调用触发它，permissionMode 不会绕过本回调，
    // 所以放行决策必须在这里做。
    if (toolName !== 'AskUserQuestion') {
      if (this.mode === 'bypassPermissions') {
        return { behavior: 'allow', updatedInput: input }
      }
      // 兜底自动放行：即便 mode 因某些路径没同步上（历史上 resume 不回灌 mode 就会退回 default），
      // 只要用户开了这个开关，也在本地同步放行，不再往浏览器要一次「其实没人看」的确认。
      if (this.autoApprove) {
        console.log(`[sidecar] 自动放行工具（弹窗自动允许）：${toolName}`)
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

  /**
   * 会话中断：把所有挂起的请求按 deny 释放。
   * 返回是否确有挂起请求——调用方据此决定要不要给 deny 响应留出写回 CLI 的时间再关传输层
   * （见 Session.interrupt()）。
   */
  rejectAll(): boolean {
    const had = this.pending.size > 0
    for (const r of this.pending.values()) r(null)
    this.pending.clear()
    return had
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
