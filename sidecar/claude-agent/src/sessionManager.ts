import { existsSync } from 'node:fs'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { Permissions, type Decision } from './permissions.js'

type Emit = (sessionId: string, event: Record<string, unknown>) => void

/** 单会话：持有 SDK session_id、当前轮的 AbortController、权限交互。 */
class Session {
  sdkSessionId?: string
  model?: string
  /** 会话级权限模式，每轮 query 传入；运行中切换下一轮生效。 */
  permissionMode = 'default'
  private abort?: AbortController
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
  async runTurn(text: string): Promise<void> {
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

  constructor(private emit: Emit) {}

  start(id: string, cwd: string, model?: string, mode?: string): void {
    const s = new Session(id, cwd || process.env.HOME || process.cwd(), (e) => this.emit(id, e))
    if (model) s.model = model
    if (mode) { s.permissionMode = mode; s.perms.setMode(mode) }
    this.sessions.set(id, s)
    // 立即回一个 init（sdkSessionId 暂为 null），让前端拿到 Ready 启用输入；
    // 真正的 sdkSessionId 在首轮 system/init 时再次回传。
    this.emit(id, { type: 'init', sdkSessionId: null })
  }

  resume(id: string, sdkSessionId: string, cwd: string): void {
    let s = this.sessions.get(id)
    if (!s) {
      s = new Session(id, cwd, (e) => this.emit(id, e))
      this.sessions.set(id, s)
    }
    if (sdkSessionId) s.sdkSessionId = sdkSessionId
    if (cwd) s.cwd = cwd
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

  drop(id: string): void {
    this.sessions.get(id)?.interrupt()
    this.sessions.delete(id)
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
