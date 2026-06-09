import { useCallback, useState } from 'react'
import { authFetch } from '@/lib/api'
import type { StartRequest, TunnelStatus } from '../types'

/**
 * 封装 start/stop mutation。不依赖 TanStack Query；
 * 状态最终以 SSE 推送为准，这里只暴露按钮 loading 与最近一次错误。
 */
export function useTunnelControl() {
  const [pending, setPending] = useState<'start' | 'stop' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(async (req: StartRequest = {}) => {
    setPending('start')
    setError(null)
    try {
      const r = await authFetch('/vscode-tunnel/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!r.ok) {
        const msg = await safeReadError(r)
        setError(msg)
        return null
      }
      return (await r.json()) as TunnelStatus
    } finally {
      setPending(null)
    }
  }, [])

  const stop = useCallback(async () => {
    setPending('stop')
    setError(null)
    try {
      const r = await authFetch('/vscode-tunnel/stop', { method: 'POST' })
      if (!r.ok) {
        const msg = await safeReadError(r)
        setError(msg)
        return null
      }
      return (await r.json()) as TunnelStatus
    } finally {
      setPending(null)
    }
  }, [])

  return { start, stop, pending, error }
}

async function safeReadError(r: Response): Promise<string> {
  try {
    const body = await r.text()
    return body || `${r.status} ${r.statusText}`
  } catch {
    return `${r.status} ${r.statusText}`
  }
}
