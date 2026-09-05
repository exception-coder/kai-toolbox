import {
  SESSION_CLIENT_PROTOCOL_VERSION,
  type ConnectionState,
  type PublicSession,
  type SessionClient,
  type SessionClientEvent,
  type SessionClientOptions,
} from './types'

const DEFAULT_API_PATH = '/api/session-client/v1'
const TERMINAL_CODES = new Set(['AUTHENTICATION_REQUIRED', 'GRANT_REVOKED', 'GRANT_EXPIRED'])

export function createSessionClient(options: SessionClientOptions): SessionClient {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  const WebSocketType = options.WebSocket ?? globalThis.WebSocket
  const listeners = new Set<(event: SessionClientEvent) => void>()
  const stateListeners = new Set<(state: ConnectionState) => void>()
  const storage = options.storage ?? globalThis.sessionStorage
  const apiPath = normalizeApiPath(options.apiPath ?? DEFAULT_API_PATH)
  const clientScope = `${normalizeBase(options.requestBaseUrl)}${apiPath}`
  const watermarkKey = `kai-session-client:watermark:${clientScope}`
  const pendingKey = `kai-session-client:pending:${clientScope}`
  let socket: WebSocket | undefined
  let destroyed = false
  let reconnectAttempts = 0
  let session: PublicSession | undefined
  let state: ConnectionState = 'idle'
  let watermark = Number(storage?.getItem(watermarkKey) ?? 0) || 0

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await options.getAccessToken?.()
    const response = await fetcher(`${normalizeBase(options.requestBaseUrl)}${apiPath}${path}`, {
      ...init,
      credentials: init?.credentials ?? 'include',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: `HTTP ${response.status}` })) as {
        code?: string; message?: string
      }
      if (payload.code && TERMINAL_CODES.has(payload.code)) setState('terminal')
      throw Object.assign(new Error(payload.message ?? `HTTP ${response.status}`), payload)
    }
    return response.json() as Promise<T>
  }

  async function openSocket(): Promise<void> {
    if (destroyed) return
    if (socket?.readyState === 0 || socket?.readyState === 1) return
    setState('connecting')
    const issued = await request<{ ticket: string }>('/connections', { method: 'POST' })
    const base = new URL(normalizeBase(options.requestBaseUrl) || globalThis.location.origin, globalThis.location.origin)
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
    base.pathname = `${base.pathname.replace(/\/$/, '')}${apiPath}/ws`
    base.search = new URLSearchParams({
      ticket: issued.ticket,
      protocolVersion: SESSION_CLIENT_PROTOCOL_VERSION,
    }).toString()
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocketType(base.toString())
      socket = ws
      ws.onopen = () => {
        reconnectAttempts = 0
        setState('connected')
        ws.send(JSON.stringify({
          type: 'attach',
          protocolVersion: SESSION_CLIENT_PROTOCOL_VERSION,
          lastEventSeq: watermark,
        }))
        for (const pending of readPending()) ws.send(JSON.stringify(pending))
        resolve()
      }
      ws.onmessage = message => handleEvent(String(message.data))
      ws.onerror = () => reject(new Error('WebSocket connection failed'))
      ws.onclose = event => {
        if (socket === ws) socket = undefined
        if (destroyed || event.code === 4003) {
          if (event.code === 4003) setState('terminal')
          return
        }
        setState('offline')
        scheduleReconnect()
      }
    })
  }

  function handleEvent(payload: string) {
    let event: SessionClientEvent
    try { event = JSON.parse(payload) as SessionClientEvent } catch { return }
    if (event.protocolVersion !== SESSION_CLIENT_PROTOCOL_VERSION) return
    if (event.seq > 0 && event.seq <= watermark) return
    if (event.seq > 0) {
      watermark = event.seq
      storage?.setItem(watermarkKey, String(watermark))
    }
    if (event.sessionVersion > 0 && session) session.sessionVersion = event.sessionVersion
    const eventData = event.data && typeof event.data === 'object'
      ? event.data as { commandId?: unknown } : undefined
    if (event.type === 'commandAccepted' && typeof eventData?.commandId === 'string') {
      writePending(readPending().filter(item => item.commandId !== eventData.commandId))
    }
    listeners.forEach(listener => listener(event))
    if (event.error && TERMINAL_CODES.has(event.error.code)) {
      setState('terminal')
      socket?.close(4003, event.error.code)
    }
  }

  function scheduleReconnect() {
    const maxAttempts = options.reconnect?.maxAttempts ?? 8
    if (reconnectAttempts >= maxAttempts || destroyed || state === 'terminal') return
    const baseDelay = options.reconnect?.baseDelayMs ?? 500
    const maxDelay = options.reconnect?.maxDelayMs ?? 15_000
    const delay = Math.min(maxDelay, baseDelay * 2 ** reconnectAttempts++)
    globalThis.setTimeout(() => void openSocket().catch(() => scheduleReconnect()), delay)
  }

  function command(type: string, data: Record<string, unknown>): string {
    if (!session || !socket || socket.readyState !== 1) throw new Error('Session Client is offline')
    const commandId = globalThis.crypto.randomUUID()
    const payload = { type, commandId, expectedSessionVersion: session.sessionVersion, ...data }
    writePending([...readPending(), payload])
    socket.send(JSON.stringify(payload))
    return commandId
  }

  function readPending(): Array<Record<string, unknown> & { commandId: string }> {
    try {
      const value = JSON.parse(storage?.getItem(pendingKey) ?? '[]')
      return Array.isArray(value) ? value.filter(item => item && typeof item.commandId === 'string') : []
    } catch { return [] }
  }

  function writePending(items: Array<Record<string, unknown> & { commandId: string }>) {
    if (items.length === 0) storage?.removeItem(pendingKey)
    else storage?.setItem(pendingKey, JSON.stringify(items.slice(-50)))
  }

  function setState(next: ConnectionState) {
    if (state === next) return
    state = next
    stateListeners.forEach(listener => listener(state))
  }

  return {
    async connect() {
      session = await request<PublicSession>('/session')
      await openSocket()
      return session
    },
    send: async input => command('send', input),
    answerQuestion: async (requestId, answers) => command('answerQuestion', { requestId, answers }),
    interrupt: async () => command('interruptOwnTurn', {}),
    async upload(file) {
      const body = new FormData()
      body.append('file', file)
      return request('/attachments', { method: 'POST', body })
    },
    loadHistory: (before, limit = 30) => request(`/messages?${new URLSearchParams({
      ...(before == null ? {} : { before: String(before) }), limit: String(limit),
    })}`),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    subscribeState(listener) { stateListeners.add(listener); listener(state); return () => stateListeners.delete(listener) },
    destroy() { destroyed = true; socket?.close(1000, 'client destroyed'); listeners.clear(); stateListeners.clear() },
  }
}

function normalizeBase(value: string): string {
  return value.trim().replace(/\/$/, '')
}

function normalizeApiPath(value: string): string {
  const path = value.trim().replace(/\/$/, '')
  return path.startsWith('/') ? path : `/${path}`
}
