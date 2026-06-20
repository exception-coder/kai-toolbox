import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Gemini CLI 引擎适配器（headless stream-json）。
 *
 * Gemini CLI 无嵌入式 SDK，走 `gemini -p <text> -o stream-json`：spawn 子进程、按行解析
 * JSONL 事件（init/message/tool_use/tool_result/error/result）→ 翻译成与 Claude/Codex 相同的
 * 统一事件协议（init/assistantDelta/toolUse/toolResult/result/error）。
 *
 * 注意：stream-json 各事件的确切字段名未文档化，本适配器做**容错多候选解析 + 未知行打日志**，
 * 首次真实带鉴权运行后据 sidecar 日志锁定字段（见设计文档 §5/§8）。
 */
export interface GeminiTurnCtx {
  text: string
  cwd: string
  model?: string
  /** 会话权限模式（四档），映射为 gemini --approval-mode。 */
  permissionMode: string
  /** 已有会话 id（resume 续跑）；无则新建。 */
  sdkSessionId?: string
  /** 第三方网关 baseURL（须 Gemini/Google 协议兼容）；置则注入 GOOGLE_GEMINI_BASE_URL。空=本机官方登录/GEMINI_API_KEY。 */
  apiBaseUrl?: string
  /** 第三方网关 API Key（注入 GEMINI_API_KEY）。 */
  authToken?: string
  signal: AbortSignal
  emit: (e: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
}

const require_ = createRequire(import.meta.url)

/** 解析随包 @google/gemini-cli 的 gemini 入口（bundle/gemini.js），用当前 node 执行。 */
function resolveGeminiBin(): string {
  const pkgJson = require_.resolve('@google/gemini-cli/package.json')
  return join(dirname(pkgJson), 'bundle', 'gemini.js')
}

/** 四档权限模式 → gemini --approval-mode 取值。 */
function mapApprovalMode(mode: string): string {
  switch (mode) {
    case 'plan':
      return 'plan' // 只读
    case 'acceptEdits':
      return 'auto_edit' // 自动放行编辑
    case 'bypassPermissions':
      return 'yolo' // 全自动
    default:
      return 'default'
  }
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === 'string' && v.length > 0) return v
  return undefined
}

function stringify(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : safeJson(v)
  return s.length > 4000 ? s.slice(0, 4000) + '…(truncated)' : s
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** 跑一轮 Gemini：spawn gemini headless，逐行解析 JSONL，翻译为统一事件。 */
export async function runGeminiTurn(ctx: GeminiTurnCtx): Promise<void> {
  const safeCwd = existsSync(ctx.cwd) ? ctx.cwd : (process.env.USERPROFILE || process.env.HOME || process.cwd())
  const bin = resolveGeminiBin()
  const args = ['-p', ctx.text, '-o', 'stream-json', '--approval-mode', mapApprovalMode(ctx.permissionMode), '--skip-trust']
  if (ctx.model) args.push('-m', ctx.model)
  // 已有会话 → 续最近一次（同 cwd）。resume 语义待真实验证（见设计文档 §8）。
  if (ctx.sdkSessionId) args.push('--resume', 'latest')

  // 第三方网关：注入 Gemini CLI 认的自定义端点 + key（须 Google/Gemini 协议兼容）。
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (ctx.apiBaseUrl && ctx.apiBaseUrl.trim()) {
    const base = ctx.apiBaseUrl.trim().replace(/\/+$/, '')
    env.GOOGLE_GEMINI_BASE_URL = base
    env.GEMINI_API_BASE_URL = base // 不同版本的别名，一并设
    if (ctx.authToken) env.GEMINI_API_KEY = ctx.authToken
    console.log(`[gemini] turn start model=${ctx.model ?? '默认'} via=${base}`)
  }

  return new Promise<void>((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(process.execPath, [bin, ...args], { cwd: safeCwd, env })
    } catch (e) {
      ctx.emit({ type: 'error', code: 'GEMINI_SPAWN_FAILED', message: e instanceof Error ? e.message : String(e) })
      resolve()
      return
    }

    const onAbort = () => { try { child.kill() } catch { /* ignore */ } }
    ctx.signal.addEventListener('abort', onAbort, { once: true })

    let buf = ''
    let stderr = ''
    let sawResult = false
    let sawText = false

    const processLine = (line: string): void => {
      const t = line.trim()
      if (!t) return
      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(t)
      } catch {
        console.warn('[gemini] 非 JSON 行:', t.slice(0, 200))
        return
      }
      switch (obj.type as string) {
        case 'init': {
          const sid = pickStr(obj.sessionId, obj.session_id, (obj as Record<string, unknown>).sessionID)
          if (sid) {
            ctx.setSdkSessionId(sid)
            ctx.emit({ type: 'init', sdkSessionId: sid })
          } else {
            ctx.emit({ type: 'init', sdkSessionId: null })
          }
          break
        }
        case 'message': {
          const role = pickStr(obj.role, (obj as Record<string, unknown>).author)
          if (role === 'user') break // 跳过用户回显
          const msg = obj.message as Record<string, unknown> | undefined
          const text = pickStr(obj.content, obj.text, obj.delta, obj.chunk, msg?.content as string, msg?.text as string)
          if (text) {
            sawText = true
            ctx.emit({ type: 'assistantDelta', text })
          }
          break
        }
        case 'tool_use': {
          const name = pickStr(obj.name, obj.tool, obj.toolName, (obj as Record<string, unknown>).tool_name) ?? 'tool'
          const input = obj.args ?? obj.input ?? obj.arguments ?? {}
          ctx.emit({ type: 'toolUse', toolName: name, input })
          break
        }
        case 'tool_result': {
          const name = pickStr(obj.name, obj.tool, obj.toolName, (obj as Record<string, unknown>).tool_name) ?? ''
          const output = obj.result ?? obj.output ?? obj.content
          const isError = Boolean(obj.error || obj.isError || obj.is_error || obj.status === 'error' || obj.status === 'failed')
          ctx.emit({ type: 'toolResult', toolName: name, output: stringify(output), isError })
          break
        }
        case 'error': {
          const err = obj.error
          const message = pickStr(obj.message, typeof err === 'string' ? err : (err as Record<string, unknown>)?.message as string) ?? 'Gemini 错误'
          ctx.emit({ type: 'error', code: 'GEMINI_ERROR', message })
          break
        }
        case 'result': {
          sawResult = true
          const usage = (obj.stats ?? obj.usage ?? {}) as Record<string, unknown>
          // 若整轮没流式发过文本，用 result 里的最终回答兜底（headless 的 response 字段）
          const resp = pickStr(obj.response, (obj as Record<string, unknown>).text)
          if (resp && !sawText) ctx.emit({ type: 'assistantDelta', text: resp })
          ctx.emit({
            type: 'turnInfo',
            requestedModel: ctx.model ?? null,
            responseModel: ctx.model ?? null,
            viaGateway: !!ctx.apiBaseUrl,
            baseUrl: ctx.apiBaseUrl ?? null,
          })
          ctx.emit({ type: 'result', usage, stopReason: 'end_turn' })
          break
        }
        default:
          console.warn('[gemini] 未知 stream-json 事件:', t.slice(0, 300))
      }
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buf += chunk
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        processLine(buf.slice(0, idx))
        buf = buf.slice(idx + 1)
      }
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (s: string) => {
      stderr += s
      process.stderr.write('[gemini] ' + s)
    })

    child.on('error', (e) => {
      ctx.signal.removeEventListener('abort', onAbort)
      ctx.emit({ type: 'error', code: 'GEMINI_SPAWN_FAILED', message: e.message })
      resolve()
    })
    child.on('close', (code) => {
      ctx.signal.removeEventListener('abort', onAbort)
      if (buf.trim()) processLine(buf) // flush 末行
      if (ctx.signal.aborted) {
        ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
      } else if (code !== 0 && !sawResult) {
        const tail = stderr.trim().slice(-300)
        // 常见失败：headless 下 OAuth 登录过期/需重新授权（_doSetupUser 弹不出浏览器）→ 给可操作提示
        const authIssue = /_doSetupUser|setupUser|oauth|login|reauth|authenticat|invalid_grant|browser|credential/i.test(stderr)
        const message = authIssue
          ? 'Gemini 登录已过期或需重新授权：headless 模式无法弹出浏览器完成 OAuth。请在本机终端运行 `gemini` 重新登录（或检查代理/网络能否访问 Google），完成后再用 Gemini 引擎；也可配置 GEMINI_API_KEY 走 API key 鉴权（免浏览器）。'
          : (tail || `gemini 退出码 ${code}`)
        ctx.emit({ type: 'error', code: authIssue ? 'GEMINI_AUTH' : `GEMINI_EXIT_${code}`, message })
      } else if (!sawResult) {
        ctx.emit({ type: 'result', usage: {}, stopReason: 'end_turn' })
      }
      resolve()
    })
  })
}
