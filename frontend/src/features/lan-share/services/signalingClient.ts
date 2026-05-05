import type { SignalingInbound, SignalingOutbound } from '../types'

type Handler<T extends SignalingInbound['type']> = (msg: Extract<SignalingInbound, { type: T }>) => void
type AnyHandler = (msg: SignalingInbound) => void

export type SignalingStatus = 'connecting' | 'open' | 'closed'

export interface SignalingClient {
  status: SignalingStatus
  send(msg: SignalingOutbound): void
  on<T extends SignalingInbound['type']>(type: T, handler: Handler<T>): () => void
  onStatus(handler: (s: SignalingStatus) => void): () => void
  close(): void
}

export function createSignalingClient(url: string): SignalingClient {
  const handlers = new Map<string, Set<AnyHandler>>()
  const statusHandlers = new Set<(s: SignalingStatus) => void>()
  let ws: WebSocket | null = null
  let status: SignalingStatus = 'connecting'

  function setStatus(s: SignalingStatus) {
    status = s
    statusHandlers.forEach(h => h(s))
  }

  function connect() {
    ws = new WebSocket(url)
    ws.onopen = () => setStatus('open')
    ws.onmessage = (ev) => {
      let parsed: SignalingInbound
      try { parsed = JSON.parse(ev.data) } catch { return }
      const set = handlers.get(parsed.type)
      set?.forEach(h => h(parsed))
    }
    ws.onclose = () => setStatus('closed')
    ws.onerror = () => { /* onclose 紧随其后 */ }
  }
  connect()

  return {
    get status() { return status },
    send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
      }
    },
    on(type, handler) {
      let set = handlers.get(type)
      if (!set) { set = new Set(); handlers.set(type, set) }
      set.add(handler as AnyHandler)
      return () => set!.delete(handler as AnyHandler)
    },
    onStatus(handler) {
      statusHandlers.add(handler)
      handler(status)
      return () => statusHandlers.delete(handler)
    },
    close() {
      ws?.close()
    },
  }
}
