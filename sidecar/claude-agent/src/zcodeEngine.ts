import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { EngineProbeResult } from './engine/engineContract.js'

const execFileAsync = promisify(execFile)
const MAX_LINE = 1024 * 1024
const TURN_TIMEOUT_MS = 15 * 60_000
type Json = Record<string, unknown>
const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}

export interface ZCodeTurnContext {
  text: string
  developerInstructions?: string
  cwd: string
  model?: string
  sdkSessionId?: string
  permissionMode: string
  toolPolicy?: string
  signal: AbortSignal
  emit(event: Json): void
  setSdkSessionId(id: string): void
}

/** Explicit native binary or trusted built CLI entry; never resolve an unrelated npm package named zcode. */
export function zcodeCommand(): { command: string; prefix: string[] } {
  const configured = process.env.ZCODE_CLI_PATH?.trim()
  if (configured) return /\.(?:cjs|mjs|js)$/i.test(configured)
    ? { command: process.execPath, prefix: [configured] } : { command: configured, prefix: [] }
  if (process.platform === 'win32') {
    const found = String(process.env.Path || process.env.PATH || '').split(path.delimiter)
      .map(dir => path.join(dir, 'zcode.exe')).find(file => existsSync(file))
    return { command: found ?? 'zcode.exe', prefix: [] }
  }
  return { command: 'zcode', prefix: [] }
}

export async function probeZCodeRuntime(): Promise<EngineProbeResult> {
  const native = zcodeCommand()
  try {
    const { stdout } = await execFileAsync(native.command, [...native.prefix, '--version'], { timeout: 3000, windowsHide: true })
    const version = stdout.match(/\b(\d+\.\d+\.\d+)\b/)?.[1]
    // Parse-only invocation: upstream help currently omits output-format, so check that the real parser accepts it.
    const help = await execFileAsync(native.command, [...native.prefix, '--output-format', 'stream-json',
      '--mode', 'build', '--workflow-mode', 'disabled', '--help'], { timeout: 3000, windowsHide: true })
    const supported = version && ['--prompt', '--resume', '--mode', '--workflow-mode'].every(flag => help.stdout.includes(flag))
    return { engine: 'zcode', status: supported ? 'ready' : 'incompatible', runtimeName: 'ZCode CLI', runtimeVersion: version,
      detail: supported ? 'CLI 参数兼容；使用 ZCode 原生登录和默认模型，模型鉴权仍需实际会话验证'
        : 'ZCode CLI 缺少已核验的非交互 JSONL、权限或恢复参数，请配置兼容版本' }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return { engine: 'zcode', status: code === 'ENOENT' ? 'dependencyMissing' : 'incompatible', runtimeName: 'ZCode CLI',
      detail: code === 'ENOENT' ? '未找到 ZCode CLI；安装官方运行时并设置 ZCODE_CLI_PATH，或将 zcode.exe 加入 PATH'
        : 'ZCode CLI 版本或参数检测失败；请核对 ZCODE_CLI_PATH、Node 版本和官方 CLI --help' }
  }
}

export function zcodeExecArgs(ctx: ZCodeTurnContext): string[] {
  if (ctx.toolPolicy && ctx.toolPolicy !== 'default') throw new Error('ZCode 首版不支持咨询、审阅或禁用工具的受限会话，拒绝启动')
  if (ctx.model) throw new Error('ZCode 首版跟随原生默认模型；请清空 Forge 模型选择后重试')
  const modes: Record<string, string> = { default: 'build', acceptEdits: 'edit', plan: 'plan', bypassPermissions: 'yolo' }
  const mode = modes[ctx.permissionMode]
  if (!mode) throw new Error('ZCode 权限模式无效，拒绝使用 CLI 默认权限')
  const prompt = [ctx.developerInstructions, ctx.text].filter(Boolean).join('\n\n')
  // CLI takes prompt as an argv value, not stdin. Refuse rather than silently truncate a Windows command line.
  if (!ctx.text.trim() || prompt.length > 20000) throw new Error('ZCode 输入为空或超过首版 20000 字符上限，请缩短后重试')
  const args = ['--output-format', 'stream-json', '--mode', mode, '--workflow-mode', 'disabled', '--no-color']
  if (ctx.sdkSessionId) args.push('--resume', ctx.sdkSessionId)
  args.push('--prompt', prompt)
  return args
}

export function parseZCodeLine(line: string): { sessionId?: string; final?: string; delta?: string; error?: string; interrupted?: boolean; usage?: Json; tool?: Json } {
  const event = record(JSON.parse(line))
  const payload = record(event.payload)
  const sessionId = typeof event.sessionId === 'string' && event.sessionId ? event.sessionId : undefined
  if (event.type === 'result') {
    if (!sessionId || typeof event.response !== 'string') throw new Error('ZCode 最终结果缺少会话身份或正文')
    const nativeUsage = record(event.usage)
    const usage: Json = {}
    for (const [from, to] of [['inputTokens', 'input_tokens'], ['outputTokens', 'output_tokens'],
      ['cacheReadTokens', 'cache_read_input_tokens'], ['cacheWriteTokens', 'cache_creation_input_tokens']]) {
      const value = nativeUsage[from]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) usage[to] = value
    }
    return { sessionId, final: typeof event.response === 'string' ? event.response : undefined,
      usage, error: ['error', 'failed'].includes(String(record(event.projection).status)) ? '原生轮次报告失败' : undefined }
  }
  if (event.type === 'model.streaming') return { sessionId,
    delta: payload.kind === 'text_delta' && typeof payload.delta === 'string' ? payload.delta : undefined }
  if (event.type === 'turn.failed') return { sessionId, error: 'ZCode 原生轮次失败，请核对登录、模型额度及原生运行日志' }
  if (event.type === 'turn.completed' && payload.resultType === 'cancelled') return { sessionId, interrupted: true }
  if (event.type === 'turn.completed' && typeof payload.resultType === 'string' && payload.resultType.startsWith('error_')) {
    return { sessionId, error: `ZCode 未完整完成：${payload.resultType}` }
  }
  if (event.type === 'tool.updated') return { sessionId, tool: payload }
  return { sessionId }
}

export async function runZCodeTurn(ctx: ZCodeTurnContext, launch: typeof spawn = spawn): Promise<void> {
  const fail = (message: string) => {
    ctx.emit({ type: 'error', code: 'ZCODE_QUERY_FAILED', message })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
  }
  if (ctx.signal.aborted) { ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' }); return }
  let args: string[]
  try { args = zcodeExecArgs(ctx) } catch (error) { fail((error as Error).message); return }
  const native = zcodeCommand()
  let child: ChildProcess
  try { child = launch(native.command, [...native.prefix, ...args], { cwd: ctx.cwd, shell: false,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { fail('ZCode CLI 无法启动，请检查运行时路径'); return }
  let buffer = '', finalText: string | undefined, nativeId = ctx.sdkSessionId, failure = ''
  let usage: Json = {}
  let timedOut = false
  let nativeInterrupted = false
  const tools = new Map<string, string>()
  const consume = (line: string) => {
    if (!line.trim()) return
    if (finalText !== undefined) { failure = 'ZCode 在最终结果后继续输出事件，未确认协议收口'; return }
    try {
      const event = parseZCodeLine(line)
      if (event.sessionId && nativeId && event.sessionId !== nativeId) {
        failure = 'ZCode 返回的会话身份与当前绑定不一致'; child.kill(); return
      }
      if (event.sessionId && !nativeId) {
        nativeId = event.sessionId
        ctx.setSdkSessionId(nativeId)
        ctx.emit({ type: 'init', sdkSessionId: nativeId })
      }
      if (event.delta) ctx.emit({ type: 'assistantDelta', text: event.delta })
      if (event.interrupted) nativeInterrupted = true
      if (event.error) failure = event.error
      if (event.final !== undefined) { finalText = event.final; usage = event.usage ?? {} }
      const tool = event.tool
      if (tool && typeof tool.toolCallId === 'string') {
        const id = tool.toolCallId
        if (tool.kind === 'started') {
          const name = typeof tool.toolName === 'string' ? tool.toolName : 'ZCode tool'
          tools.set(id, name)
          ctx.emit({ type: 'toolUse', toolCallId: id, toolName: name, input: {} })
        } else if (tool.kind === 'result' || tool.kind === 'error') {
          const result = record(tool.result)
          const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content ?? tool.error ?? '')
          ctx.emit({ type: 'toolResult', toolCallId: id, toolName: tools.get(id) ?? 'ZCode tool',
            output: content.slice(0, 12000), isError: tool.kind === 'error' || result.isError === true })
          tools.delete(id)
        }
      }
    } catch { failure = 'ZCode 返回无效 JSONL，不能将部分输出当作完成'; child.kill() }
  }
  const abort = () => { child.kill() }
  ctx.signal.addEventListener('abort', abort, { once: true })
  if (ctx.signal.aborted) abort()
  const timer = setTimeout(() => { timedOut = true; child.kill() }, TURN_TIMEOUT_MS)
  timer.unref?.()
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.length > MAX_LINE) { failure = 'ZCode 单条事件过大'; child.kill(); return }
      consume(line)
    }
    if (buffer.length > MAX_LINE) { failure = 'ZCode 单条事件过大'; child.kill() }
  })
  // Drain diagnostics without forwarding credentials, prompts or provider-native stderr to the browser.
  child.stderr?.resume()
  const outcome = await new Promise<{ code: number | null; error?: Error }>(resolve => {
    child.once('error', error => resolve({ code: null, error }))
    child.once('close', code => resolve({ code }))
  })
  clearTimeout(timer)
  ctx.signal.removeEventListener('abort', abort)
  consume(buffer)
  if (ctx.signal.aborted || nativeInterrupted) ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
  else if (outcome.error || outcome.code !== 0 || failure || !finalText?.trim() || !nativeId) {
    fail(timedOut ? 'ZCode 执行超过 15 分钟；已请求终止，未报告成功'
      : failure || `ZCode 未完整完成（退出码 ${outcome.code ?? 'unknown'}）；请检查原生 CLI 登录、模型配置与运行日志`)
  } else {
    ctx.emit({ type: 'assistantSnapshot', text: finalText })
    ctx.emit({ type: 'result', usage, stopReason: 'end_turn' })
  }
}
