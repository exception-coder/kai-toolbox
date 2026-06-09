import { useEffect, useState } from 'react'
import { authEventSource, authFetch } from '@/lib/api'
import type { TunnelStatus } from '../types'

type ConnState = 'connecting' | 'open' | 'closed' | 'error'

const STATUS_PATH = '/vscode-tunnel/status'
const EVENTS_PATH = '/vscode-tunnel/events'

/**
 * 订阅后端 SSE 状态流。挂载时先 GET /status 拿快照（兜底 EventSource 还没建立就显示 STOPPED）。
 * SSE 连接成功后服务端也会立刻推一帧 status，会覆盖快照 —— 不会丢事件。
 * EventSource 默认 3s 自动重连，不需要手动处理。
 */
export function useTunnelStatus(): { status: TunnelStatus | null; conn: ConnState } {
  const [status, setStatus] = useState<TunnelStatus | null>(null)
  const [conn, setConn] = useState<ConnState>('connecting')

  useEffect(() => {
    let cancelled = false

    authFetch(STATUS_PATH)
      .then(r => r.ok ? r.json() : null)
      .then((s: TunnelStatus | null) => {
        if (!cancelled && s) setStatus(s)
      })
      .catch(() => { /* 服务端临时不可用就让 SSE 接力 */ })

    const es = authEventSource(EVENTS_PATH)
    es.addEventListener('status', e => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as TunnelStatus
        setStatus(parsed)
      } catch {
        // ignore malformed
      }
    })
    es.onopen = () => setConn('open')
    es.onerror = () => setConn('error')

    return () => {
      cancelled = true
      es.close()
      setConn('closed')
    }
  }, [])

  return { status, conn }
}
