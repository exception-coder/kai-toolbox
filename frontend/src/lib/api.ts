const API_BASE = '/api'

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown, message: string) {
    super(message)
  }
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
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
