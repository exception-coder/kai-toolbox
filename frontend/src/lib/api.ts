import { isMockEnabled } from './mock/mode'
import { matchHttp, matchSse, MockHttpError, type Method } from './mock/registry'

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
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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
}

/**
 * Subscribe to an SSE endpoint. Returns a close function.
 * Uses native EventSource; falls back gracefully to onerror on connection drop.
 */
export function subscribeSse(path: string, handlers: SseHandlers): () => void {
  if (isMockEnabled()) {
    return mockSubscribeSse(path, handlers)
  }
  const url = API_BASE + path
  const es = new EventSource(url)

  es.onopen = () => handlers.onOpen?.()
  es.onerror = (e) => handlers.onError?.(e)

  const wrap = (eventName: string) => (e: MessageEvent) => {
    let parsed: unknown = e.data
    try { parsed = JSON.parse(e.data) } catch { /* keep as string */ }
    handlers.onEvent?.(eventName, parsed)
  }

  ;['progress', 'completed', 'cancelled', 'error'].forEach(name =>
    es.addEventListener(name, wrap(name) as EventListener)
  )

  return () => es.close()
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
