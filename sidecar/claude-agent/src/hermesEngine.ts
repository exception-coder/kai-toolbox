import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { EngineProbeResult } from './engine/engineContract.js'

type Json = Record<string, unknown>
const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const MAX_LINE = 2 * 1024 * 1024
const RPC_TIMEOUT = 60_000
const TURN_TIMEOUT = 15 * 60_000
const CANCEL_TIMEOUT = 10_000

export function hermesCommand(): { command: string; args: string[] } {
  const python = process.env.HERMES_PYTHON_PATH?.trim()
  if (python) return { command: python, args: ['-m', 'acp_adapter'] }
  return { command: process.env.HERMES_CLI_PATH?.trim() || (process.platform === 'win32' ? 'hermes.exe' : 'hermes'), args: ['acp'] }
}

/** Hermes ACP uses newline-delimited JSON-RPC, not Codex App Server. */
export class HermesAcpClient {
  private nextId = 0
  private buffer = ''
  private failed?: Error
  private pending = new Map<number, { resolve(value: Json): void; reject(error: Error): void; timer: NodeJS.Timeout }>()
  readonly child: ChildProcessWithoutNullStreams
  constructor(private readonly onUpdate: (params: Json) => void = () => undefined,
    private readonly onPermission: (params: Json) => Promise<Json> = async () => ({ outcome: { outcome: 'cancelled' } }),
    launch: typeof spawn = spawn) {
    const native = hermesCommand()
    this.child = launch(native.command, native.args, { shell: false, windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      let newline: number
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline)
        this.buffer = this.buffer.slice(newline + 1)
        if (line.length > MAX_LINE) { this.fail(new Error('Hermes ACP 事件过大')); return }
        if (!line.trim()) continue
        try { this.receive(record(JSON.parse(line))) }
        catch { this.fail(new Error('Hermes ACP 返回无效事件，执行状态未确认')); return }
      }
      if (this.buffer.length > MAX_LINE) this.fail(new Error('Hermes ACP 事件过大'))
    })
    // Never forward provider diagnostics, local credential paths or prompts to the browser.
    this.child.stderr.resume()
    this.child.stdin.on('error', () => this.fail(new Error('Hermes ACP 输入通道关闭')))
    this.child.once('error', error => this.fail(error))
    this.child.once('close', () => this.fail(new Error('Hermes ACP 连接已关闭，不能假定后台任务已停止')))
  }
  private send(message: Json): void {
    if (this.failed) throw this.failed
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
  }
  request(method: string, params: Json, timeout = RPC_TIMEOUT): Promise<Json> {
    if (this.failed) return Promise.reject(this.failed)
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Hermes ACP ${method} 超时，禁止自动重发`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ id, method, params }) } catch (error) {
        clearTimeout(timer); this.pending.delete(id); reject(error as Error)
      }
    })
  }
  notify(method: string, params: Json): void { this.send({ method, params }) }
  private receive(message: Json): void {
    if (message.jsonrpc !== '2.0') throw new Error('Invalid JSON-RPC')
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        const response = message.method === 'session/request_permission'
          ? this.onPermission(record(message.params))
          : Promise.reject(new Error('Unsupported ACP client method'))
        void response.then(result => this.send({ id: message.id, result }),
          () => this.send({ id: message.id, error: { code: -32601, message: 'Forge does not provide this ACP client capability' } }))
          .catch(() => undefined)
      } else if (message.method === 'session/update') this.onUpdate(record(message.params))
      return
    }
    if (typeof message.id !== 'number') throw new Error('Missing response id')
    const pending = this.pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer); this.pending.delete(message.id)
    if (message.error) pending.reject(new Error('Hermes ACP 请求失败；请检查原生登录、模型配置及运行日志'))
    else if (message.result !== null && typeof message.result === 'object' && !Array.isArray(message.result)) pending.resolve(record(message.result))
    else pending.reject(new Error('Hermes ACP 结果无效或原生会话不存在；禁止自动创建替代会话'))
  }
  private fail(error: Error): void {
    this.failed ??= error
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(this.failed) }
    this.pending.clear()
  }
  close(): void {
    // This closes only the owned ACP viewer. It is NOT a native cancellation acknowledgement.
    this.fail(new Error('Hermes ACP viewer closed'))
    this.child.kill()
  }
}

export async function initializeHermes(client: Pick<HermesAcpClient, 'request'>): Promise<Json> {
  const result = await client.request('initialize', { protocolVersion: 1,
    clientCapabilities: {}, clientInfo: { name: 'forge', version: '1.0.0' } }, 15_000)
  if (result.protocolVersion !== 1 || record(result.agentInfo).name !== 'hermes-agent'
    || record(result.agentCapabilities).loadSession !== true) throw new Error('Hermes ACP 协议或精确恢复能力不兼容')
  return result
}

export async function probeHermesRuntime(createClient: () => Pick<HermesAcpClient, 'request' | 'close'> = () => new HermesAcpClient()): Promise<EngineProbeResult> {
  let client: Pick<HermesAcpClient, 'request' | 'close'> | undefined
  try {
    client = createClient()
    const result = await initializeHermes(client)
    return { engine: 'hermes', status: 'ready', runtimeName: 'Hermes ACP', runtimeVersion: String(record(result.agentInfo).version || ''),
      detail: 'ACP 握手兼容；原生账号、模型及后台执行器仍需实际会话验证' }
  } catch (error) {
    return { engine: 'hermes', status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'dependencyMissing' : 'incompatible',
      runtimeName: 'Hermes ACP', detail: 'Hermes ACP 未就绪；检查官方运行时及 ACP 依赖，配置 HERMES_CLI_PATH 或 HERMES_PYTHON_PATH。未自动安装或登录。' }
  } finally { client?.close() }
}

export interface HermesTurnContext {
  text: string
  developerInstructions?: string
  cwd: string
  model?: string
  images?: readonly { mediaType: string; data: string }[]
  sdkSessionId?: string
  permissionMode: string
  toolPolicy?: string
  signal: AbortSignal
  emit(event: Json): void
  setSdkSessionId(id: string): void
  canUseTool?: (name: string, input: Json, options: { signal: AbortSignal }) => Promise<Json>
}
export interface HermesClient {
  request(method: string, params: Json, timeout?: number): Promise<Json>
  notify(method: string, params: Json): void
  close(): void
}
type ClientFactory = (update: (params: Json) => void, permission: (params: Json) => Promise<Json>) => HermesClient

/** Durable unknown-turn guard: reconnect or process loss must not replay a daemon-owned turn. */
export async function acquireHermesTurn(sessionId: string, root = path.join(os.homedir(), '.kai-toolbox', 'hermes-turns')): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true, mode: 0o700 })
  const file = path.join(root, createHash('sha256').update(sessionId).digest('hex') + '.json')
  let handle
  try { handle = await open(file, 'wx', 0o600) }
  catch { throw new Error('Hermes 此会话有未确认的原生轮次；先在原生端核对并停止，不自动重放或创建替代会话') }
  try { await handle.writeFile(JSON.stringify({ sessionId, pid: process.pid, createdAt: new Date().toISOString() })) }
  finally { await handle.close() }
  return () => unlink(file)
}

export async function runHermesTurn(ctx: HermesTurnContext,
  createClient: ClientFactory = (update, permission) => new HermesAcpClient(update, permission),
  acquire: typeof acquireHermesTurn = acquireHermesTurn): Promise<void> {
  let client: HermesClient | undefined, nativeId = ctx.sdkSessionId, release: (() => Promise<void>) | undefined
  let prompting = false, terminal = false, text = '', cancelTimer: NodeJS.Timeout | undefined
  const denied = { outcome: { outcome: 'cancelled' } }
  const tools = new Map<string, string>()
  const controller = new AbortController()
  let cancelReject: ((error: Error) => void) | undefined
  const cancellation = new Promise<never>((_, reject) => { cancelReject = reject })
  // Attach immediately: cancellation may occur during initialize/load, before prompt starts.
  void cancellation.catch(() => undefined)
  const abort = () => {
    controller.abort()
    if (!prompting) return
    try { client?.notify('session/cancel', { sessionId: nativeId }) } catch { /* No false acknowledgement. */ }
    cancelTimer ??= setTimeout(() => cancelReject?.(new Error('Hermes 原生取消未确认；后台可能仍在执行，禁止自动续发')), CANCEL_TIMEOUT)
  }
  ctx.signal.addEventListener('abort', abort, { once: true })
  try {
    if (ctx.signal.aborted) { ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' }); return }
    if (ctx.toolPolicy && ctx.toolPolicy !== 'default') throw new Error('Hermes 首版不支持咨询、审阅或禁用工具的受限会话')
    if (ctx.model) throw new Error('Hermes 首版跟随原生模型配置；不接受 Forge 模型覆盖')
    if (ctx.images?.length) throw new Error('Hermes 首版未接入图片输入，拒绝静默忽略附件')
    const mode = ({ default: 'default', acceptEdits: 'accept_edits' } as Record<string, string>)[ctx.permissionMode]
    if (!mode) throw new Error('Hermes 首版仅支持原生审批与接受工作区编辑，不映射不等价的规划或完全访问权限')
    const prompt = [ctx.developerInstructions, ctx.text].filter(Boolean).join('\n\n')
    if (!ctx.text.trim() || prompt.length > 200000) throw new Error('Hermes 输入为空或超过 200000 字符上限')
    if (nativeId) release = await acquire(nativeId)
    client = createClient(params => {
      if (!prompting) return // Ignore history replay from session/load; Forge already owns displayed history.
      if (params.sessionId !== nativeId) throw new Error('Hermes 会话事件身份不匹配')
      const update = record(params.update), content = record(update.content)
      if (update.sessionUpdate === 'agent_message_chunk' && content.type === 'text' && typeof content.text === 'string') {
        text += content.text
        if (text.length > 2 * 1024 * 1024) throw new Error('Hermes 回复超过展示上限')
        ctx.emit({ type: 'assistantDelta', text: content.text })
      }
      if ((update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') && typeof update.toolCallId === 'string') {
        const id = update.toolCallId
        if (update.sessionUpdate === 'tool_call') {
          const name = typeof update.title === 'string' ? update.title : 'Hermes tool'
          tools.set(id, name)
          ctx.emit({ type: 'toolUse', toolCallId: id, toolName: name, input: record(update.rawInput) })
        }
        if (update.status === 'completed' || update.status === 'failed') {
          ctx.emit({ type: 'toolResult', toolCallId: id, toolName: tools.get(id) || 'Hermes tool',
            output: JSON.stringify(update.content ?? update.rawOutput ?? '').slice(0, 12000), isError: update.status === 'failed' })
          tools.delete(id)
        }
      }
    }, async params => {
      if (!prompting || params.sessionId !== nativeId || controller.signal.aborted || !ctx.canUseTool) return denied
      const tool = record(params.toolCall)
      const input = record(tool.rawInput)
      const decision = await ctx.canUseTool(tool.kind === 'execute' ? 'Bash' : 'Hermes tool', input, { signal: controller.signal })
      if (decision.behavior !== 'allow' || controller.signal.aborted) return denied
      // Never select permanent/session-wide grants on behalf of a one-operation Forge approval.
      const options = Array.isArray(params.options) ? params.options.map(record) : []
      const once = options.find(option => option.kind === 'allow_once' && typeof option.optionId === 'string')
      return once ? { outcome: { outcome: 'selected', optionId: once.optionId } } : denied
    })
    await initializeHermes(client)
    const session = await client.request(nativeId ? 'session/load' : 'session/new', { cwd: ctx.cwd, mcpServers: [], ...(nativeId ? { sessionId: nativeId } : {}) })
    if (!nativeId) {
      if (typeof session.sessionId !== 'string' || !session.sessionId.trim()) throw new Error('Hermes 未返回原生会话身份')
      nativeId = session.sessionId
      ctx.setSdkSessionId(nativeId)
      ctx.emit({ type: 'init', sdkSessionId: nativeId, slashCommands: [], skills: [], agents: [], mcpServers: [] })
    } else if (session.sessionId !== undefined && session.sessionId !== nativeId) throw new Error('Hermes 恢复返回另一会话，拒绝发送')
    const modes = record(session.modes).availableModes
    if (!Array.isArray(modes) || !modes.some(value => record(value).id === mode)) throw new Error('Hermes 未声明所选原生权限模式')
    await client.request('session/set_mode', { sessionId: nativeId, modeId: mode })
    if (controller.signal.aborted) { ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' }); return }
    release ??= await acquire(nativeId)
    if (controller.signal.aborted) { ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' }); return }
    prompting = true
    const result = await Promise.race([client.request('session/prompt', { sessionId: nativeId,
      prompt: [{ type: 'text', text: prompt }] }, TURN_TIMEOUT), cancellation])
    if (!['end_turn', 'cancelled', 'max_tokens', 'max_turn_requests', 'refusal'].includes(String(result.stopReason))) throw new Error('Hermes 未返回可信轮次终态')
    terminal = true
    if (result.stopReason === 'cancelled') ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' })
    else if (result.stopReason !== 'end_turn' || !text.trim()) throw new Error(`Hermes 未完整完成（${String(result.stopReason)}）`)
    else {
      // Hermes gateway may return cumulative session counters; do not count them as this turn's usage.
      ctx.emit({ type: 'assistantSnapshot', text })
      ctx.emit({ type: 'result', usage: {}, stopReason: 'end_turn' })
    }
  } catch (error) {
    // A failed/closed ACP viewer does not prove its daemon-owned prompt stopped.
    if (prompting && !terminal) { try { client?.notify('session/cancel', { sessionId: nativeId }) } catch { /* Preserve guard. */ } }
    ctx.emit({ type: 'error', code: prompting && !terminal ? 'HERMES_TURN_UNCONFIRMED' : 'HERMES_QUERY_FAILED',
      message: error instanceof Error ? error.message : 'Hermes 请求失败' })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'error' })
  } finally {
    ctx.signal.removeEventListener('abort', abort)
    controller.abort()
    if (cancelTimer) clearTimeout(cancelTimer)
    const shouldRelease = terminal || !prompting
    prompting = false
    client?.close()
    if (shouldRelease && release) await release()
  }
}
