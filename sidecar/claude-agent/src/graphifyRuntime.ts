import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { McpGraphifyBackend } from './graphifyMcpBackend.js'
import {
  GraphifyQueryScheduler,
  GraphifySchedulerBusyError,
  type ScheduledGraphifyQuery,
} from './graphifyQueryScheduler.js'
import {
  GraphifyBackendError,
  type GraphifyBackend,
  type GraphifyProjectSnapshot,
  type GraphifyRuntimeOutcome,
  type GraphifyRuntimeQuery,
  type GraphifyRuntimeReady,
  type GraphifyRuntimeSnapshot,
} from './graphifyRuntimeTypes.js'

const QUERY_PATH = '/internal/graphify/query'
const STATUS_PATH = '/internal/graphify/status'
const MAX_REQUEST_BYTES = 64 * 1024
const DEFAULT_REQUEST_WAIT_MS = 42_000
const DEFAULT_BACKEND_TIMEOUT_MS = 120_000
const DEFAULT_RETRY_AFTER_MS = 5_000

export const GRAPHIFY_RUNTIME_TOKEN = randomBytes(32).toString('base64url')
export type {
  GraphifyBackend,
  GraphifyRuntimeOutcome,
  GraphifyRuntimeQuery,
  GraphifyRuntimeSnapshot,
} from './graphifyRuntimeTypes.js'
export { extractGraphifyTextContent } from './graphifyMcpBackend.js'

type QueryResult = {
  text: string
  backendDurationMs: number
}

type ProjectRuntimeState = GraphifyProjectSnapshot

export interface GraphifyRuntimeOptions {
  requestWaitMs?: number
  backendTimeoutMs?: number
  retryAfterMs?: number
}

export function graphifyRuntimeChildEnv(port = Number(process.env.CLAUDE_CHAT_SIDECAR_PORT) || 18890): Record<string, string> {
  return {
    CONSULT_GRAPHIFY_RUNTIME_URL: `http://127.0.0.1:${port}${QUERY_PATH}`,
    CONSULT_GRAPHIFY_RUNTIME_TOKEN: GRAPHIFY_RUNTIME_TOKEN,
  }
}

/**
 * Process-level Graphify query service.
 *
 * HTTP request lifetime and graph loading lifetime are intentionally separate: a cold 262 MB graph
 * may outlive the first caller's wait budget, while the Python process and scheduled work remain
 * useful to every following session.
 */
export class GraphifyRuntime {
  private readonly backend: GraphifyBackend
  private readonly scheduler: GraphifyQueryScheduler<QueryResult>
  private readonly requestWaitMs: number
  private readonly backendTimeoutMs: number
  private readonly retryAfterMs: number
  private readonly projects = new Map<string, ProjectRuntimeState>()
  private closed = false

  constructor(
    backend: GraphifyBackend = new McpGraphifyBackend(),
    scheduler = new GraphifyQueryScheduler<QueryResult>(),
    options: GraphifyRuntimeOptions = {},
  ) {
    this.backend = backend
    this.scheduler = scheduler
    this.requestWaitMs = positiveDuration(
      options.requestWaitMs ?? configuredDuration(process.env.GRAPHIFY_REQUEST_WAIT_MS),
      DEFAULT_REQUEST_WAIT_MS,
    )
    this.backendTimeoutMs = positiveDuration(
      options.backendTimeoutMs ?? configuredDuration(process.env.GRAPHIFY_BACKEND_TIMEOUT_MS),
      DEFAULT_BACKEND_TIMEOUT_MS,
    )
    this.retryAfterMs = positiveDuration(options.retryAfterMs, DEFAULT_RETRY_AFTER_MS)
  }

  async query(input: GraphifyRuntimeQuery): Promise<GraphifyRuntimeOutcome> {
    if (this.closed) throw new Error('Graphify 运行时已关闭')
    const query = validateQuery(input)
    const requestStartedAt = Date.now()
    const project = this.projectState(query.projectPath)
    const wasReady = project.state === 'READY'
    const key = queryKey(query)
    let scheduled: ScheduledGraphifyQuery<QueryResult>
    try {
      scheduled = this.scheduler.schedule(key, async () => {
        const startedAt = Date.now()
        project.state = 'WARMING'
        project.phase = wasReady ? 'querying' : 'loading-project-graph'
        project.lastStartedAt = startedAt
        project.lastError = undefined
        console.log(`[graphify-runtime] query-start key=${shortKey(key)} phase=${project.phase} project=${query.projectPath}`)
        try {
          const text = await this.backend.query(query, this.backendTimeoutMs)
          project.state = 'READY'
          project.phase = 'idle'
          project.lastReadyAt = Date.now()
          const backendDurationMs = Date.now() - startedAt
          console.log(`[graphify-runtime] query-ready key=${shortKey(key)} durationMs=${backendDurationMs}`)
          return { text, backendDurationMs }
        } catch (error) {
          project.state = 'DEGRADED'
          project.phase = 'idle'
          project.lastFailureAt = Date.now()
          project.lastError = error instanceof Error ? error.message : String(error)
          console.error(`[graphify-runtime] query-failed key=${shortKey(key)} durationMs=${Date.now() - startedAt} error=${project.lastError}`)
          throw error
        }
      })
    } catch (error) {
      if (!(error instanceof GraphifySchedulerBusyError)) throw error
      return {
        status: 'pending',
        state: 'WARMING',
        code: 'GRAPHIFY_BUSY',
        phase: 'queued',
        retryAfterMs: this.retryAfterMs,
        message: error.message,
        durationMs: Date.now() - requestStartedAt,
      }
    }

    if (scheduled.phase === 'queued') {
      project.state = project.state === 'READY' ? 'READY' : 'WARMING'
      project.phase = 'queued'
    }
    const pendingPhase = scheduled.phase === 'queued'
      ? 'queued'
      : wasReady ? 'querying' : 'loading-project-graph'
    return this.waitForScheduledQuery(scheduled, requestStartedAt, pendingPhase)
  }

  snapshot(): GraphifyRuntimeSnapshot {
    return {
      backend: this.backend.snapshot(),
      scheduler: this.scheduler.snapshot(),
      projects: [...this.projects.values()].map(project => ({ ...project })),
    }
  }

  async close(reason = 'shutdown'): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.scheduler.close(`Graphify 运行时关闭：${reason}`)
    await this.backend.close(reason)
  }

  private async waitForScheduledQuery(
    scheduled: ScheduledGraphifyQuery<QueryResult>,
    requestStartedAt: number,
    pendingPhase: 'queued' | 'loading-project-graph' | 'querying',
  ): Promise<GraphifyRuntimeOutcome> {
    const completed = scheduled.promise.then<GraphifyRuntimeReady>(result => ({
      status: 'ready',
      state: 'READY',
      text: result.text,
      durationMs: Date.now() - requestStartedAt,
      channel: 'persistent-mcp',
      cached: scheduled.cached,
    }))
    const value = await waitWithin(completed, this.requestWaitMs)
    if (value.completed) return value.value

    // Keep an explicit rejection handler attached after the HTTP caller leaves. The scheduler owns
    // the operation now and will make the result available to the next identical request.
    void completed.catch(() => undefined)
    return {
      status: 'pending',
      state: 'WARMING',
      code: 'GRAPHIFY_WARMING',
      phase: pendingPhase,
      retryAfterMs: this.retryAfterMs,
      message: '代码图谱正在预热或排队，后台任务会继续；稍后重试将复用同一运行时。',
      durationMs: Date.now() - requestStartedAt,
    }
  }

  private projectState(projectPath: string): ProjectRuntimeState {
    let state = this.projects.get(projectPath)
    if (!state) {
      state = { projectPath, state: 'COLD', phase: 'idle' }
      this.projects.set(projectPath, state)
    }
    return state
  }
}

function validateQuery(input: GraphifyRuntimeQuery): Required<GraphifyRuntimeQuery> {
  if (!path.isAbsolute(input.projectPath)) throw new Error('projectPath 必须是绝对目录')
  const projectPath = path.resolve(input.projectPath)
  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) throw new Error('projectPath 不存在或不是目录')
  const graphPath = path.join(projectPath, 'graphify-out', 'graph.json')
  if (!existsSync(graphPath) || !statSync(graphPath).isFile()) throw new Error('项目未找到 graphify-out/graph.json')
  const question = input.question?.trim()
  if (!question || question.length > 8_000) throw new Error('question 长度必须为 1-8000 字符')
  if (!Number.isInteger(input.tokenBudget) || input.tokenBudget < 200 || input.tokenBudget > 2_000) {
    throw new Error('tokenBudget 必须为 200-2000 的整数')
  }
  if (input.mode != null && input.mode !== 'bfs' && input.mode !== 'dfs') throw new Error('mode 只允许 bfs 或 dfs')
  return { ...input, projectPath, question, mode: input.mode ?? 'bfs' }
}

function queryKey(query: Required<GraphifyRuntimeQuery>): string {
  return `${query.projectPath}\n${query.mode}\n${query.tokenBudget}\n${query.question}`
}

function shortKey(key: string): string {
  let hash = 2166136261
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function configuredDuration(value: string | undefined): number | undefined {
  const parsed = value?.trim() ? Number(value) : undefined
  return Number.isFinite(parsed) ? parsed : undefined
}

function positiveDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.trunc(Number(value)) : fallback
}

function waitWithin<T>(promise: Promise<T>, milliseconds: number): Promise<
  { completed: true; value: T } | { completed: false }
> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ completed: false }), milliseconds)
    promise.then(value => {
      clearTimeout(timer)
      resolve({ completed: true, value })
    }, error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function authorized(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization || ''
  const actual = header.startsWith('Bearer ') ? header.slice(7) : ''
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(token)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error('请求体超过 64 KB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

type RuntimeHttpPort = Pick<GraphifyRuntime, 'query' | 'snapshot'>

export function createGraphifyRuntimeRequestHandler(runtime: RuntimeHttpPort, token = GRAPHIFY_RUNTIME_TOKEN) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const queryRequest = request.method === 'POST' && url.pathname === QUERY_PATH
    const statusRequest = request.method === 'GET' && url.pathname === STATUS_PATH
    if (!queryRequest && !statusRequest) {
      sendJson(response, 404, { ok: false, code: 'NOT_FOUND' })
      return
    }
    if (!authorized(request, token)) {
      sendJson(response, 401, { ok: false, code: 'UNAUTHORIZED' })
      return
    }
    if (statusRequest) {
      sendJson(response, 200, { ok: true, ...runtime.snapshot() })
      return
    }
    try {
      const body = await readJsonBody(request) as GraphifyRuntimeQuery
      const result = await runtime.query(body)
      if (result.status === 'pending') {
        sendJson(response, 202, { ok: false, ...result })
      } else {
        sendJson(response, 200, { ok: true, ...result })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const invalid = /projectPath|question|tokenBudget|mode|请求体|JSON|graph\.json/.test(message)
      const backendError = error instanceof GraphifyBackendError ? error : undefined
      const timeout = backendError?.kind === 'timeout' || /timeout|超时/i.test(message)
      sendJson(response, invalid ? 400 : timeout ? 504 : 503, {
        ok: false,
        code: invalid ? 'INVALID_REQUEST' : timeout ? 'GRAPHIFY_RUNTIME_TIMEOUT' : 'GRAPHIFY_RUNTIME_UNAVAILABLE',
        state: 'DEGRADED',
        message,
      })
    }
  }
}
