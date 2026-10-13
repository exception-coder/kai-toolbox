import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { createCodexPredictionProcess } from './codexAppServer.js'
import { configuredMcpServerNames } from './codexSecurity.js'
import { CodexPredictionCleanupError } from './codexPredictionCleanup.js'

export interface CodexPredictionOptions {
  sessionId: string
  threadId: string
  sourceTurnId: string
  codexHome?: string
  cwd: string
  model?: string
  config?: Record<string, unknown>
  emit: (event: Record<string, unknown>) => void
}

type PredictionRunner = (options: CodexPredictionOptions, signal: AbortSignal) => Promise<string | null>
const MAX_TEXT_LENGTH = 1_000
const PREDICTION_TIMEOUT_MS = 15_000

/** Only a correlated notification carries a prediction; request acknowledgement does not. */
export function parseCodexPrediction(
  params: Record<string, unknown>, threadId: string, sourceTurnId: string,
): { text: string | null } | undefined {
  if (params.threadId !== threadId || params.sourceTurnId !== sourceTurnId) return undefined
  const result = params.result as Record<string, unknown> | null
  if (!result || !['completed', 'failed'].includes(String(result.type))) return undefined
  const text = result.type === 'completed' && typeof result.text === 'string' ? result.text.trim() : ''
  return { text: text && text.length <= MAX_TEXT_LENGTH && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? text : null }
}

function predictionKey(threadId: string, codexHome?: string): string {
  const directory = resolve(codexHome || resolve(homedir(), '.codex'))
  return JSON.stringify([process.platform === 'win32' ? directory.toLowerCase() : directory, threadId])
}

/** Owns auxiliary writers independently of the main task and releases them before native resume. */
export class CodexPredictionCoordinator {
  private readonly tasks = new Map<string, {
    controller: AbortController; promise: Promise<void>; sourceTurnId: string
  }>()

  constructor(private readonly run: PredictionRunner = readCodexPrediction) {}

  start(options: CodexPredictionOptions): void {
    const key = predictionKey(options.threadId, options.codexHome)
    const previous = this.tasks.get(key)
    if (previous?.sourceTurnId === options.sourceTurnId) return
    previous?.controller.abort()
    const controller = new AbortController()
    const task = { controller, sourceTurnId: options.sourceTurnId, promise: Promise.resolve() }
    task.promise = (async () => {
      if (previous) await this.release(previous.promise)
      if (controller.signal.aborted) return
      const text = await this.run(options, controller.signal)
      if (text && !controller.signal.aborted && this.tasks.get(key) === task) {
        options.emit({ type: 'codexPrediction', sessionId: options.sessionId,
          sdkSessionId: options.threadId, sourceTurnId: options.sourceTurnId, text })
      }
    })().then(() => {
      if (this.tasks.get(key) === task) this.tasks.delete(key)
    })
    this.tasks.set(key, task)
    // Failed cleanup remains a barrier rather than allowing a second writer to overlap it.
    void task.promise.catch(error => console.warn(JSON.stringify({
      event: 'codex_prediction_cleanup_failed', sessionId: options.sessionId,
      message: error instanceof Error ? error.message : String(error),
    })))
  }

  async cancel(threadId: string | undefined, codexHome?: string): Promise<void> {
    if (!threadId) return
    const task = this.tasks.get(predictionKey(threadId, codexHome))
    if (!task) return
    task.controller.abort()
    await this.release(task.promise)
    const key = predictionKey(threadId, codexHome)
    if (this.tasks.get(key) === task) this.tasks.delete(key)
  }

  private async release(promise: Promise<void>): Promise<void> {
    try {
      await promise
    } catch (error) {
      if (!(error instanceof CodexPredictionCleanupError)) throw error
      await error.verifyRelease()
    }
  }
}

export const codexPredictions = new CodexPredictionCoordinator()

export async function readCodexPrediction(
  options: CodexPredictionOptions, signal: AbortSignal,
  runtime = { open: createCodexPredictionProcess, timeoutMs: PREDICTION_TIMEOUT_MS },
): Promise<string | null> {
  if (signal.aborted) return null
  let auxiliary: ReturnType<typeof createCodexPredictionProcess>
  try { auxiliary = runtime.open(options.codexHome) } catch {
    console.info(JSON.stringify({ event: 'codex_prediction_unavailable', sessionId: options.sessionId }))
    return null
  }
  const { child } = auxiliary
  const lines = createInterface({ input: child.stdout })
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  let nextId = 0
  let settled = false
  let predictionRequested = false
  let predictionText: string | null = null
  let resolvePrediction: (value: string | null) => void = () => {}
  const prediction = new Promise<string | null>(resolveResult => { resolvePrediction = resolveResult })
  const finish = (text: string | null = null) => {
    if (settled) return
    predictionText = text
    settled = true
    for (const request of pending.values()) request.reject(new Error('Prediction ended'))
    pending.clear()
    resolvePrediction(text)
  }
  const request = (method: string, params: Record<string, unknown>): Promise<unknown> => {
    if (settled || signal.aborted) return Promise.reject(new Error('Prediction cancelled'))
    const id = ++nextId
    return new Promise((resolveRequest, reject) => {
      pending.set(id, { resolve: resolveRequest, reject })
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) finish() })
    })
  }
  const timer = setTimeout(() => finish(), runtime.timeoutMs)
  timer.unref?.()
  const onAbort = () => finish()
  signal.addEventListener('abort', onAbort, { once: true })
  child.stdin.on('error', () => finish())
  child.stderr.resume()
  child.once('error', () => finish())
  child.once('close', () => finish())
  lines.on('line', line => {
    if (settled) return
    let event: Record<string, unknown>
    try { event = JSON.parse(line) } catch { return }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return
    if (typeof event.id === 'number' && !event.method) {
      const item = pending.get(event.id)
      if (!item) return
      pending.delete(event.id)
      if (event.error) item.reject(new Error('Prediction RPC unavailable'))
      else item.resolve(event.result)
    } else if (event.method === 'thread/prediction/updated' && predictionRequested) {
      const result = parseCodexPrediction((event.params ?? {}) as Record<string, unknown>, options.threadId, options.sourceTurnId)
      if (result) finish(result.text)
    } else if (event.method && event.id != null) {
      child.stdin.write(JSON.stringify({ id: event.id, error: { code: -32601, message: 'Prediction does not execute tools' } }) + '\n')
    }
  })
  try {
    await request('initialize', { clientInfo: { name: 'kai_toolbox_prediction', version: '0.1.0' }, capabilities: { experimentalApi: true } })
    if (settled) return null
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
    const config = { ...options.config }
    const servers = new Set(configuredMcpServerNames(options.codexHome))
    const sessionServers = config.mcp_servers && typeof config.mcp_servers === 'object'
      ? config.mcp_servers as Record<string, unknown> : {}
    for (const server of Object.keys(sessionServers)) servers.add(server)
    for (const key of Object.keys(config)) {
      const server = /^mcp_servers\.([^.]+)\./.exec(key)?.[1]
      if (server) servers.add(server)
    }
    for (const server of servers) config[`mcp_servers.${server}.enabled`] = false
    config.mcp_servers = Object.fromEntries([...servers].map(server => [server, { enabled: false }]))
    await request('thread/resume', { threadId: options.threadId, cwd: options.cwd,
      model: options.model ?? null, approvalPolicy: 'never', sandbox: 'read-only', config })
    predictionRequested = true
    await request('thread/prediction/request', { threadId: options.threadId, sourceTurnId: options.sourceTurnId })
    return await prediction
  } catch {
    if (!signal.aborted && !predictionText) console.info(JSON.stringify({ event: 'codex_prediction_unavailable', sessionId: options.sessionId }))
    return predictionText
  } finally {
    finish()
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
    lines.close()
    // readline.close() pauses stdout; drain trailing output so EOF can deliver close.
    // Keep the native close check: exitCode alone does not prove inherited pipes released.
    child.stdout.resume()
    await auxiliary.close()
  }
}
