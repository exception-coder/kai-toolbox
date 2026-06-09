import { isMockEnabled } from './mock/mode'
import { matchHttp, matchSse, MockHttpError, type Method } from './mock/registry'
import { ensureFreshToken, withAuthToken } from './auth'

const API_BASE = '/api'

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown, message: string) {
    super(message)
  }
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMockEnabled()) {
    return mockHttp<T>(path, init)
  }
  // 请求前确保 token 新鲜（软鉴权端点过期返回空而非 401，必须主动续期）。
  await ensureFreshToken()
  // 自动附带 JWT（若已登录）。key 与 lib/auth.ts 一致；此处直接读 localStorage 避免循环依赖。
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('toolbox.auth.token') : null
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let payload: unknown = null
    try { payload = await res.json() } catch { /* not JSON */ }
    const msg =
      (payload && typeof payload === 'object' && 'message' in payload && typeof (payload as Record<string, unknown>).message === 'string')
        ? (payload as Record<string, string>).message
        : `HTTP ${res.status}`
    throw new ApiError(res.status, payload, msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * 带鉴权的原始 fetch：用于 {@link http} 不适用的场景——二进制 body（音频）、multipart（FormData）、
 * 或需要读响应头（HEAD）。统一做 `ensureFreshToken()` + `Authorization: Bearer`，但**不**强制
 * Content-Type（交给调用方，FormData 尤其必须由浏览器自动带 boundary）。返回原始 Response。
 * path 不含 `/api` 前缀。feature 层一律用本函数代替裸 `fetch('/api/...')`，避免漏带 JWT。
 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  await ensureFreshToken()
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('toolbox.auth.token') : null
  return fetch(API_BASE + path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
}

/**
 * 带鉴权的 EventSource：EventSource 不能设请求头，故用 `withAuthToken` 把 JWT 拼到 `access_token`
 * 查询参数（后端 JwtAuthFilter 兜底读取）。feature 层一律用本函数代替裸 `new EventSource('/api/...')`。
 * path 不含 `/api` 前缀。需要 GET SSE 的标准事件流可直接用 {@link subscribeSse}。
 */
export function authEventSource(path: string): EventSource {
  return new EventSource(withAuthToken(API_BASE + path))
}

async function mockHttp<T>(path: string, init?: RequestInit): Promise<T> {
  const method = ((init?.method ?? 'GET').toUpperCase()) as Method
  const matched = matchHttp(method, path)
  if (!matched) {
    throw new ApiError(404, null, `[mock] no handler for ${method} ${path}`)
  }
  const body = parseBody(init?.body)
  try {
    const result = await matched.handler({
      method,
      path: matched.path,
      params: matched.params,
      query: matched.query,
      body,
    })
    return result as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (e instanceof MockHttpError) throw new ApiError(e.status, null, e.message)
    throw new ApiError(500, null, e instanceof Error ? e.message : String(e))
  }
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') return null
  try { return JSON.parse(body) } catch { return body }
}

export type SseHandlers = {
  onEvent?: (eventName: string, data: unknown) => void
  onError?: (err: Event | Error) => void
  onOpen?: () => void
  /** 流自然结束（连接关闭）时触发。用于检测「结束但从未收到终止事件」的静默中断。 */
  onClose?: () => void
}

/** Default named events every long-running endpoint in this app emits. */
const DEFAULT_SSE_EVENTS = ['progress', 'completed', 'cancelled', 'error']

/**
 * Subscribe to an SSE endpoint. Returns a close function. {@link extraEvents} merges with
 * the default set so callers can listen to feature-specific events (e.g. {@code status},
 * {@code language}) without duplicating the wrapper.
 */
export function subscribeSse(path: string, handlers: SseHandlers, extraEvents: string[] = []): () => void {
  if (isMockEnabled()) {
    return mockSubscribeSse(path, handlers)
  }
  // EventSource 不能设请求头，故把 JWT 拼到 access_token 查询参数（后端 JwtAuthFilter 兜底读取）。
  // 与 subscribeSsePost 一致，避免 @SoftGuard / admin-only 的 GET SSE 因匿名被静默空响应。
  const es = new EventSource(withAuthToken(API_BASE + path))

  es.onopen = () => handlers.onOpen?.()
  es.onerror = (e) => handlers.onError?.(e)

  const wrap = (eventName: string) => (e: MessageEvent) => {
    let parsed: unknown = e.data
    try { parsed = JSON.parse(e.data) } catch { /* keep as string */ }
    handlers.onEvent?.(eventName, parsed)
  }

  const eventNames = Array.from(new Set([...DEFAULT_SSE_EVENTS, ...extraEvents]))
  eventNames.forEach(name =>
    es.addEventListener(name, wrap(name) as EventListener)
  )

  return () => es.close()
}

/**
 * POST 流式 SSE：EventSource 不支持 POST 也不支持自定义 body，
 * 所以用 fetch + ReadableStream 自己解 `event: xxx\ndata: ...\n\n` 帧。
 *
 * 返回 abort 函数；调用 abort 会中断 fetch、后端那侧的 SseEmitter 也会因连接断开而退出。
 */
export function subscribeSsePost(
  path: string,
  body: unknown,
  handlers: SseHandlers,
): () => void {
  const ctl = new AbortController()
  ;(async () => {
    try {
      // 与 http() 一致：先确保 token 新鲜，再带上 JWT。否则 @SoftGuard 写接口会按未授权返回空 JSON。
      await ensureFreshToken()
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('toolbox.auth.token') : null
      const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      })
      if (!res.ok || !res.body) {
        handlers.onError?.(new Error(`SSE 启动失败: HTTP ${res.status}`))
        return
      }
      // 软鉴权未授权 / 接口异常时后端会回 application/json 空体而非事件流，
      // 这里据 Content-Type 提前识别，避免前端把非流响应当成「正在生成」无限等待。
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream')) {
        handlers.onError?.(
          new Error(`未建立流式连接：服务端返回 ${contentType || '未知类型'} 而非事件流（可能未登录或接口异常）`),
        )
        return
      }
      handlers.onOpen?.()
      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          handlers.onClose?.()
          break
        }
        buffer += decoder.decode(value, { stream: true })
        // SSE 帧以双换行分隔
        let idx: number
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          let eventName = 'message'
          const dataLines: string[] = []
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
            // 忽略 id: retry: 行
          }
          if (dataLines.length === 0) continue
          const raw = dataLines.join('\n')
          let parsed: unknown = raw
          try { parsed = JSON.parse(raw) } catch { /* 保留字符串 */ }
          handlers.onEvent?.(eventName, parsed)
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)))
      }
    }
  })()
  return () => ctl.abort()
}

function mockSubscribeSse(path: string, handlers: SseHandlers): () => void {
  const matched = matchSse(path)
  if (!matched) {
    queueMicrotask(() => handlers.onError?.(new Error(`[mock] no SSE handler for ${path}`)))
    return () => {}
  }
  let closed = false
  queueMicrotask(() => {
    if (!closed) handlers.onOpen?.()
  })
  const emit = (name: string, data: unknown) => {
    if (!closed) handlers.onEvent?.(name, data)
  }
  const stop = matched.handler(
    { path: matched.path, params: matched.params, query: matched.query },
    emit,
  )
  return () => {
    closed = true
    stop()
  }
}
