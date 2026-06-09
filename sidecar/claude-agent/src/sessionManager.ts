import { existsSync } from 'node:fs'
import { query, forkSession } from '@anthropic-ai/claude-agent-sdk'
import { Permissions, type Decision } from './permissions.js'
import { runCodexTurn } from './codexEngine.js'

export type Engine = 'claude' | 'codex'

type Emit = (sessionId: string, event: Record<string, unknown>) => void

// Claude 的 supportedModels 对所有会话是同一份、且很稳定。全局缓存，供任意会话 start/resume 即时重发。
// supportedModels 是控制请求（非对话轮次），故启动时预热一次即可填充——见 prewarmClaudeModels。
let cachedClaudeModels: unknown[] | null = null
let claudeWarmStarted = false

/**
 * 启动预热：建一次性 query 仅发控制请求 supportedModels 取模型清单，拿到即 abort，绝不跑对话轮次。
 * 解决「sidecar 重启后首次进会话、未发消息 → 模型组空」的冷启动窗口。失败静默（首轮对话仍会再取）。
 */
async function prewarmClaudeModels(): Promise<void> {
  if (cachedClaudeModels || claudeWarmStarted) return
  claudeWarmStarted = true
  const ac = new AbortController()
  const safeCwd = process.env.USERPROFILE || process.env.HOME || process.cwd()
  try {
    const q = query({
      prompt: 'warmup',
      options: { cwd: safeCwd, permissionMode: 'default', abortController: ac },
    } as never)
    const fn = (q as { supportedModels?: () => Promise<unknown> }).supportedModels
    if (typeof fn === 'function') {
      const models = await fn.call(q)
      if (Array.isArray(models)) {
        cachedClaudeModels = models
        console.log(`[sidecar] 预热 Claude 模型清单：${models.length} 个`)
      }
    }
  } catch (e) {
    console.warn('[sidecar] 预热 Claude 模型失败（首轮对话会再取）：', e instanceof Error ? e.message : String(e))
  } finally {
    ac.abort() // 取消一次性 query，绝不真正处理 warmup 这轮
  }
}

/** 单会话：持有 SDK session_id、当前轮的 AbortController、权限交互。 */
class Session {
  sdkSessionId?: string
  model?: string
  /** 会话引擎，新建时定、resume 沿用；决定 runTurn 走 Claude 还是 Codex。 */
  engine: Engine = 'claude'
  /** 会话级权限模式，每轮 query 传入；运行中切换下一轮生效。 */
  permissionMode = 'default'
  private abort?: AbortController
  private modelsFetched = false
  readonly perms: Permissions

  constructor(
    readonly id: string,
    public cwd: string,
    private readonly emitSelf: (e: Record<string, unknown>) => void,
  ) {
    this.perms = new Permissions(emitSelf)
  }

  /**
   * 跑一轮：把用户消息交给 SDK，流式回吐事件。resume 续跑靠 sdkSessionId。
   *
   * 对「启动 native 二进制失败」做有限重试：该二进制有 200MB+，首次启动可能被
   * 杀软实时扫描短暂锁住而 spawn 失败。只在本轮尚未产出任何消息时重试，避免重复输出。
   */
  async runTurn(text: string, systemPrompt?: string): Promise<void> {
    if (this.engine === 'codex') return this.runCodexTurn(text)
    const maxAttempts = 3
    // spawn claude.exe 时若 working dir 不存在会直接「exists but failed to launch」；
    // cwd 失效（历史会话来自已删除/改名/异机路径）则回退到用户主目录，避免起不来。
    const safeCwd = existsSync(this.cwd) ? this.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
    if (safeCwd !== this.cwd) {
      console.warn(`[sidecar] 会话 cwd 不存在，回退到 ${safeCwd}（原 cwd: ${this.cwd}）`)
    }
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ac = new AbortController()
      this.abort = ac
      const toolNames = new Map<string, string>() // tool_use_id -> 工具名
      let emitted = false
      let nativeStderr = ''

      try {
        const q = query({
          prompt: text,
          options: {
            // 仅 oneShot 传：作为真正的 system 提示（字符串=替换 SDK 默认 system）。
            // 交互式聊天 runTurn 不传 → 走 SDK 默认（编码 agent 语境），互不影响。
            ...(systemPrompt ? { systemPrompt } : {}),
            cwd: safeCwd,
            model: this.model || undefined,
            resume: this.sdkSessionId || undefined,
            permissionMode: this.permissionMode,
            includePartialMessages: true,
            canUseTool: this.perms.canUseTool,
            abortController: ac,
            // 把 native 二进制的 stderr 透到 sidecar 日志，失败时也并入错误信息
            stderr: (s: string) => {
              nativeStderr += s
              process.stderr.write('[claude-native] ' + s)
            },
          },
        } as never)

        this.fetchModels(q)

        for await (const m of q as AsyncIterable<Record<string, unknown>>) {
          emitted = true
          this.handle(m, toolNames)
        }
        return
      } catch (e: unknown) {
        if (ac.signal.aborted) {
          this.emitSelf({ type: 'result', usage: {}, stopReason: 'interrupted' })
          return
        }
        const message = e instanceof Error ? e.message : String(e)
        const launchFailure = /failed to launch|spawn|ENOENT|EACCES|EPERM/i.test(message)
        if (launchFailure && !emitted && attempt < maxAttempts) {
          console.error(`[sidecar] 启动 Claude 失败(第 ${attempt}/${maxAttempts} 次)，1.5s 后重试：${message}`)
          await delay(1500)
          continue
        }
        const detail = nativeStderr.trim() ? `${message}（${nativeStderr.trim().slice(-300)}）` : message
        this.emitSelf({ type: 'error', code: 'QUERY_FAILED', message: detail })
        return
      } finally {
        this.abort = undefined
      }
    }
  }

  /** 跑一轮 Codex：委托 codexEngine 翻译事件流，AbortController 支持中断。 */
  private async runCodexTurn(text: string): Promise<void> {
    const ac = new AbortController()
    this.abort = ac
    try {
      await runCodexTurn({
        text,
        cwd: this.cwd,
        model: this.model,
        permissionMode: this.permissionMode,
        sdkSessionId: this.sdkSessionId,
        signal: ac.signal,
        emit: (e) => this.emitSelf(e),
        setSdkSessionId: (id) => { this.sdkSessionId = id },
      })
    } finally {
      this.abort = undefined
    }
  }

  /** 首轮取一次可用模型清单（SDK 控制请求 supportedModels），缓存避免重复；失败静默。 */
  private fetchModels(q: unknown): void {
    if (this.modelsFetched) return
    this.modelsFetched = true
    const fn = (q as { supportedModels?: () => Promise<unknown> }).supportedModels
    if (typeof fn !== 'function') return
    Promise.resolve(fn.call(q))
      .then((models) => {
        if (Array.isArray(models)) {
          cachedClaudeModels = models // 全局缓存，供后续会话 start/resume 即时重发
          this.emitSelf({ type: 'models', models, current: this.model ?? null })
        }
      })
      .catch((e) => console.warn('[sidecar] supportedModels 失败:', e instanceof Error ? e.message : String(e)))
  }

  // 把 SDK 消息翻译成与 Java 约定的事件
  private handle(m: Record<string, unknown>, toolNames: Map<string, string>): void {
    const type = m.type as string
    switch (type) {
      case 'system': {
        if (m.subtype === 'init' && m.session_id) {
          this.sdkSessionId = m.session_id as string
          // SDK init 自带可用 slash 命令清单（含内置 + ~/.claude/commands 自定义），透传给前端做补全
          const slashCommands = Array.isArray(m.slash_commands) ? m.slash_commands : []
          this.emitSelf({ type: 'init', sdkSessionId: this.sdkSessionId, slashCommands })
        }
        break
      }
      case 'stream_event': {
        const ev = m.event as Record<string, unknown> | undefined
        const delta = ev?.delta as Record<string, unknown> | undefined
        if (ev?.type === 'content_block_delta' && delta?.type === 'text_delta') {
          this.emitSelf({ type: 'assistantDelta', text: delta.text as string })
        }
        break
      }
      case 'assistant': {
        const content = (m.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined
        for (const b of content ?? []) {
          if (b.type === 'tool_use') {
            toolNames.set(b.id as string, b.name as string)
            this.emitSelf({ type: 'toolUse', toolName: b.name, input: b.input })
          }
        }
        break
      }
      case 'user': {
        const content = (m.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined
        // 真用户文本回合（带 uuid、非 tool_result、非合成）→ 上报 uuid，供「从此处分叉」定位
        const uuid = m.uuid as string | undefined
        const isToolResult = Array.isArray(content) && content.some(b => b?.type === 'tool_result')
        if (uuid && !isToolResult && !m.isSynthetic) {
          this.emitSelf({ type: 'userMessage', uuid })
        }
        for (const b of content ?? []) {
          if (b.type === 'tool_result') {
            this.emitSelf({
              type: 'toolResult',
              toolName: toolNames.get(b.tool_use_id as string) ?? '',
              output: stringifyContent(b.content),
              isError: Boolean(b.is_error),
            })
          }
        }
        break
      }
      case 'result': {
        if (m.session_id) this.sdkSessionId = m.session_id as string
        this.emitSelf({ type: 'result', usage: m.usage ?? {}, stopReason: m.subtype ?? 'end_turn' })
        break
      }
    }
  }

  decide(reqId: string, d: Decision): void {
    this.perms.resolve(reqId, d)
  }

  interrupt(): void {
    this.abort?.abort()
    this.perms.rejectAll()
  }
}

/** 多会话路由：一个 sidecar 进程内按 sessionId 管理多个 Session。 */
export class SessionManager {
  private sessions = new Map<string, Session>()

  constructor(private emit: Emit) {
    // 启动即预热 Claude 模型清单（控制请求，不跑对话），消除重启后首次进会话的空窗
    void prewarmClaudeModels()
  }

  start(id: string, cwd: string, model?: string, mode?: string, engine?: string): void {
    const s = new Session(id, cwd || process.env.HOME || process.cwd(), (e) => this.emit(id, e))
    if (model) s.model = model
    if (engine === 'codex') s.engine = 'codex'
    if (mode) { s.permissionMode = mode; s.perms.setMode(mode) }
    this.sessions.set(id, s)
    // 立即回一个 init（sdkSessionId 暂为 null），让前端拿到 Ready 启用输入；
    // 真正的 sdkSessionId 在首轮 system/init 时再次回传。
    this.emit(id, { type: 'init', sdkSessionId: null })
    this.emitCachedModels(id, s)
  }

  resume(id: string, sdkSessionId: string, cwd: string, engine?: string): void {
    let s = this.sessions.get(id)
    if (!s) {
      s = new Session(id, cwd, (e) => this.emit(id, e))
      this.sessions.set(id, s)
    }
    if (sdkSessionId) s.sdkSessionId = sdkSessionId
    if (cwd) s.cwd = cwd
    if (engine === 'codex' || engine === 'claude') s.engine = engine
    this.emitCachedModels(id, s)
  }

  /** Claude 会话且已有全局缓存时，即时重发 models，让 resume/切会话也能立刻看到模型组。 */
  private emitCachedModels(id: string, s: Session): void {
    if (s.engine === 'claude' && cachedClaudeModels) {
      this.emit(id, { type: 'models', models: cachedClaudeModels, current: s.model ?? null })
    }
  }

  user(id: string, text: string): void {
    const s = this.sessions.get(id)
    if (!s) {
      this.emit(id, { type: 'error', code: 'SESSION_NOT_FOUND', message: '会话不存在' })
      return
    }
    void s.runTurn(text)
  }

  decide(id: string, reqId: string, d: Decision): void {
    this.sessions.get(id)?.decide(reqId, d)
  }

  interrupt(id: string): void {
    this.sessions.get(id)?.interrupt()
  }

  /** 切换会话权限模式，下一轮 runTurn 生效。 */
  setMode(id: string, mode: string): void {
    const s = this.sessions.get(id)
    if (s) { s.permissionMode = mode; s.perms.setMode(mode) }
  }

  /** 切换会话模型，下一轮 runTurn 生效。 */
  setModel(id: string, model: string): void {
    const s = this.sessions.get(id)
    if (s) s.model = model
  }

  /** 从某条用户消息分叉出新会话（截到该消息），emit forked 带新 sdkSessionId 给 Java 建会话续跑。 */
  async forkSession(id: string, upToMessageId: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s || !s.sdkSessionId) {
      this.emit(id, { type: 'error', code: 'FORK_FAILED', message: '会话未就绪，无法分叉' })
      return
    }
    try {
      const res = await forkSession(s.sdkSessionId, { upToMessageId, dir: s.cwd })
      this.emit(id, { type: 'forked', sdkSessionId: res.sessionId, cwd: s.cwd })
    } catch (e) {
      this.emit(id, { type: 'error', code: 'FORK_FAILED', message: e instanceof Error ? e.message : String(e) })
    }
  }

  drop(id: string): void {
    this.sessions.get(id)?.interrupt()
    this.sessions.delete(id)
  }

  /**
   * 一次性无状态生成：建临时 Session（不入 sessions Map），bypassPermissions，
   * 把 system+user 拼成一个 prompt 跑一轮，复用 Session.handle 逐片 emit assistantDelta + result/error。
   * 用于「高质量」简历优化引擎——Agent 当作更强的 LLM，纯文本进出，不调工具、不接 MCP、不持久化。
   */
  async oneShot(id: string, systemPrompt: string, userPrompt: string, model?: string): Promise<void> {
    const cwd = process.env.USERPROFILE || process.env.HOME || process.cwd()
    const s = new Session(id, cwd, (e) => this.emit(id, e))
    if (model) s.model = model
    s.permissionMode = 'bypassPermissions'
    s.perms.setMode('bypassPermissions')
    // 角色说明走 SDK 独立 systemPrompt 通道，user 只放任务+原文；仅影响这次一次性 query。
    await s.runTurn(userPrompt, systemPrompt)
  }
}

function stringifyContent(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return truncate(content)
  if (Array.isArray(content)) {
    return truncate(
      content
        .map((b) => (typeof b === 'string' ? b : ((b as Record<string, unknown>)?.text as string) ?? JSON.stringify(b)))
        .join('\n'),
    )
  }
  return truncate(JSON.stringify(content))
}

function truncate(s: string, max = 4000): string {
  return s.length > max ? s.slice(0, max) + '…(truncated)' : s
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
