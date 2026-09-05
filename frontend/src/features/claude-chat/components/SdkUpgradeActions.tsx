import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { http } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface UpgradeStatus {
  running: boolean
  phase: string
  engine: string | null
  message: string
  logPath: string | null
}

/** 固定引擎的一键检查升级；轮询服务端任务以支持面板关闭后继续。 */
export function SdkUpgradeActions({ onUpdated }: { onUpdated: () => void }) {
  const { user } = useAuth()
  const admin = user?.roles.includes('ADMIN') ?? false
  const [engine, setEngine] = useState('codex')
  const [status, setStatus] = useState<UpgradeStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!admin) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const value = await http<UpgradeStatus>('/claude-chat/sidecar/upgrade')
        if (cancelled) return
        setStatus(value)
        setError(null)
        if (value.running) timer = setTimeout(() => void poll(), 1500)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '升级状态读取失败')
      }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [admin, refresh])

  useEffect(() => {
    if (status?.phase === 'SUCCEEDED') onUpdated()
    // 仅在服务端阶段变化时刷新版本目录。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.phase])

  const upgrade = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const next = await http<UpgradeStatus>(`/claude-chat/sidecar/upgrade?engine=${engine}`, { method: 'POST' })
      setStatus(next)
      setRefresh(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'SDK 升级启动失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!admin) return <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">SDK 升级由管理员操作。</p>
  const busy = submitting || status?.running
  return (
    <div className="mt-3 border-t pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="待升级的 SDK" value={engine} disabled={busy}
          onChange={event => setEngine(event.target.value)}
          className="h-8 rounded-md border bg-[var(--color-background)] px-2 focus-visible:outline-2 disabled:opacity-50">
          <option value="codex">Codex SDK</option>
          <option value="claude">Claude Agent SDK</option>
          <option value="opencode">OpenCode SDK</option>
        </select>
        <button type="button" disabled={busy} onClick={() => void upgrade()}
          className="flex h-8 items-center gap-2 rounded-md border px-3 hover:bg-[var(--color-accent)] focus-visible:outline-2 disabled:opacity-50">
          {busy ? <RefreshCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {busy ? '正在升级…' : '一键检查并升级'}
        </button>
        <button type="button" onClick={() => setRefresh(value => value + 1)}
          className="h-8 rounded-md px-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] focus-visible:outline-2">
          刷新状态
        </button>
      </div>
      <p className="mt-2 leading-relaxed text-[var(--color-muted-foreground)]">升级会验证并重连运行时；请在所有会话和后台任务结束后操作。</p>
      {status && status.phase !== 'IDLE' && <p role="status" className="mt-2 break-words leading-relaxed">{status.message}</p>}
      {error && <p role="alert" className="mt-2 text-[var(--color-destructive)]">{error}。可刷新状态后重试。</p>}
      {status?.logPath && <details className="mt-2 text-[var(--color-muted-foreground)]">
        <summary className="cursor-pointer">诊断日志位置</summary>
        <code className="mt-1 block break-all select-all">{status.logPath}</code>
      </details>}
    </div>
  )
}
