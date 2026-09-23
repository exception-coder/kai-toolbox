import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { EngineProbeResult } from './engine/engineContract.js'

const execFileAsync = promisify(execFile)
const MAX_LINE = 1024 * 1024
const MAX_DIAGNOSTIC = 4096
const TURN_TIMEOUT_MS = 15 * 60 * 1000

export function supportsTraeExecJsonl(version: string | undefined, execHelp: string, resumeHelp: string): boolean {
  return !!version && execHelp.includes('--json') && resumeHelp.includes('SESSION_ID')
}

export interface TraeTurnContext {
  text: string
  cwd: string
  model?: string
  sdkSessionId?: string
  permissionMode: string
  toolPolicy?: string
  developerInstructions?: string
  signal: AbortSignal
  emit: (event: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
}

/** Probe the installed CLI's real capabilities; TraeCode CLI 2.0 currently reports a 0.x binary version. */
export async function probeTraeRuntime(command = traeCommand()): Promise<EngineProbeResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, ['--version'], { timeout: 3000, windowsHide: true })
    const version = `${stdout} ${stderr}`.match(/\b(\d+\.\d+(?:\.\d+)?)\b/)?.[1]
    const execHelp = await execFileAsync(command, ['exec', '--help'], { timeout: 3000, windowsHide: true })
    const resumeHelp = await execFileAsync(command, ['exec', 'resume', '--help'], { timeout: 3000, windowsHide: true })
    if (!supportsTraeExecJsonl(version, execHelp.stdout, resumeHelp.stdout)) return {
      engine: 'trae', status: 'incompatible', runtimeName: 'TraeCode CLI', runtimeVersion: version,
      detail: '当前 traecli 缺少 JSONL 执行或按 ID 恢复能力；请安装 TraeCode CLI 2.0',
    }
    try {
      await execFileAsync(command, ['login', 'status'], { timeout: 3000, windowsHide: true })
    } catch {
      return { engine: 'trae', status: 'unavailable', runtimeName: 'TraeCode CLI', runtimeVersion: version,
        detail: 'TraeCode CLI 已安装但未登录；请在运行 Forge 的同一 Windows 账户执行 traecli login' }
    }
    return { engine: 'trae', status: 'ready', runtimeName: 'TraeCode CLI', runtimeVersion: version,
      detail: 'TraeCode CLI 已安装并登录；可运行实际会话' }
  } catch (error) {
    return { engine: 'trae', status: 'dependencyMissing', runtimeName: 'TraeCode CLI',
      detail: `未检测到可运行的 traecli：${error instanceof Error ? error.message : String(error)}` }
  }
}

export function traeCommand(): string {
  if (process.env.TRAECLI_PATH?.trim()) return process.env.TRAECLI_PATH.trim()
  if (process.platform === 'win32') {
    const candidates = [
      ...String(process.env.Path || process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, 'traex.exe')),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'TraeCLI', 'bin', 'traex.exe'),
    ]
    const found = candidates.find(file => existsSync(file))
    if (found) return found
  }
  return 'traecli'
}

/** Never implicitly resume "the latest" thread: only the native ID bound to this Forge session may be reused. */
export function traeExecArgs(ctx: Pick<TraeTurnContext, 'model' | 'sdkSessionId' | 'permissionMode' | 'toolPolicy'>): string[] {
  const readonly = ctx.toolPolicy === 'disabled' || ctx.toolPolicy === 'review-only'
    || ctx.toolPolicy === 'consult-readonly' || ctx.permissionMode === 'plan'
  const bypass = !readonly && ctx.permissionMode === 'bypassPermissions'
  const sandbox = readonly ? 'read-only' : bypass ? 'danger-full-access' : 'workspace-write'
  const args = ctx.sdkSessionId
    ? ['--sandbox', sandbox, '--ask-for-approval', 'never', 'exec', 'resume', '--json', '--skip-git-repo-check',
      '--permission-mode', readonly ? 'plan' : bypass ? 'bypass_permissions' : 'default']
    : ['exec', '--json', '--color', 'never', '--skip-git-repo-check', '--sandbox', sandbox,
      '--ask-for-approval', 'never']
  if (ctx.model) args.push('--model', ctx.model)
  if (ctx.sdkSessionId) args.push(ctx.sdkSessionId)
  args.push('-') // Read prompt from stdin; avoids command-line length and shell escaping issues.
  return args
}

type Json = Record<string, unknown>
function record(value: unknown): Json | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined
}

export function parseTraeLine(line: string): { sessionId?: string; text?: string; error?: string;
  tool?: { phase: 'started' | 'completed'; id: string; name: string; input: Json; output?: string; isError?: boolean } } {
  const event = record(JSON.parse(line))
  if (!event) return {}
  const kind = typeof event.type === 'string' ? event.type : ''
  const item = record(event.item)
  const sessionId = kind === 'thread.started' || kind === 'session.started'
    ? [event.thread_id, event.session_id, event.sessionId].find(value => typeof value === 'string' && value) as string | undefined
    : undefined
  const message = kind === 'item.completed' && item?.type === 'agent_message' ? item : undefined
  const text = typeof message?.text === 'string' ? message.text
    : kind === 'result' && typeof event.result === 'string' ? event.result
      : undefined
  const error = kind === 'error' || kind === 'turn.failed'
    ? String(event.message ?? record(event.error)?.message ?? 'TraeCode CLI 执行失败') : undefined
  const isTool = item && (item.type === 'command_execution' || item.type === 'file_change' || item.type === 'mcp_tool_call')
  const tool = isTool && (kind === 'item.started' || kind === 'item.completed')
    ? { phase: kind === 'item.started' ? 'started' as const : 'completed' as const,
      id: typeof item.id === 'string' ? item.id : `${item.type}-${String(item.command ?? item.path ?? 'unknown')}`,
      name: String(item.type), input: { command: item.command, path: item.path },
      output: typeof item.output === 'string' ? item.output : undefined,
      isError: item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0) }
    : undefined
  return { sessionId, text, error, tool }
}

export async function runTraeTurn(ctx: TraeTurnContext,
                                  launch: typeof spawn = spawn): Promise<void> {
  if (ctx.signal.aborted) {
    ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
    return
  }
  let child: ChildProcess
  try {
    child = launch(traeCommand(), traeExecArgs(ctx), { cwd: ctx.cwd, shell: false, windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    ctx.emit({ type: 'error', code: 'TRAE_CLI_UNAVAILABLE', message: String(error) })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
    return
  }
  let buffer = ''
  let diagnostic = ''
  let lastText = ''
  let lastError = ''
  let identifiedSession = ctx.sdkSessionId
  let malformed = false
  const consumeLine = (line: string): void => {
    if (!line.trim()) return
    try {
      const event = parseTraeLine(line)
      if (event.sessionId && event.sessionId !== identifiedSession) {
        identifiedSession = event.sessionId
        ctx.setSdkSessionId(event.sessionId)
        ctx.emit({ type: 'init', sdkSessionId: event.sessionId })
      }
      if (event.text) lastText = event.text
      if (event.error) lastError = event.error
      if (event.tool?.phase === 'started') ctx.emit({ type: 'toolUse', toolCallId: event.tool.id,
        toolName: event.tool.name, input: event.tool.input })
      if (event.tool?.phase === 'completed') ctx.emit({ type: 'toolResult', toolCallId: event.tool.id,
        toolName: event.tool.name, output: event.tool.output ?? '', isError: event.tool.isError ?? false })
    } catch { malformed = true }
  }
  let timedOut = false
  const onAbort = () => child.kill()
  ctx.signal.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => { timedOut = true; child.kill() }, TURN_TIMEOUT_MS)
  timeout.unref?.()
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    if (buffer.length > MAX_LINE * 2) { malformed = true; child.kill(); return }
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      consumeLine(line)
    }
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => { diagnostic = (diagnostic + chunk).slice(-MAX_DIAGNOSTIC) })
  child.stdin?.on('error', () => { /* spawn failure or early CLI exit is reported by the child outcome. */ })
  child.stdin?.end([ctx.developerInstructions, ctx.text].filter(Boolean).join('\n\n'))
  const outcome = await new Promise<{ code: number | null; error?: Error }>(resolve => {
    child.once('error', error => resolve({ code: null, error }))
    child.once('close', code => resolve({ code }))
  })
  consumeLine(buffer)
  ctx.signal.removeEventListener('abort', onAbort)
  clearTimeout(timeout)
  if (ctx.signal.aborted) {
    ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
  } else if (outcome.error || outcome.code !== 0 || lastError || !lastText) {
    const detail = timedOut ? '执行超过 15 分钟，已中断' : outcome.error?.message || lastError || diagnostic.trim()
      || (malformed ? '返回了无法解析的 JSONL' : `退出码 ${outcome.code ?? 'unknown'}，未返回助手答复`)
    ctx.emit({ type: 'error', code: outcome.error ? 'TRAE_CLI_UNAVAILABLE' : 'TRAE_QUERY_FAILED',
      message: `TraeCode CLI 执行失败：${detail}。请检查 traecli login status 与当前工作目录。` })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
  } else {
    ctx.emit({ type: 'assistantSnapshot', text: lastText })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'end_turn' })
  }
}
