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

const SDK_OPTIONS = [
  { id: 'codex', name: 'Codex SDK' },
  { id: 'qwen', name: 'Qwen Code SDK' },
  { id: 'claude', name: 'Claude Agent SDK' },
  { id: 'opencode', name: 'OpenCode SDK' },
]

/** 所选引擎共用一次升级；轮询任务以支持面板关闭后继续。 */
export function SdkUpgradeActions({ onUpdated }: { onUpdated: () => void }) {
  const { user } = useAuth()
  const admin = user?.roles.includes('ADMIN') ?? false
  const [engines, setEngines] = useState<string[]>(['codex'])
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
        if (value.running && value.engine) {
          setEngines(SDK_OPTIONS.filter(option => value.engine?.split(',').includes(option.id)).map(option => option.id))
        }
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
      const query = new URLSearchParams()
      engines.forEach(engine => query.append('engines', engine))
      const next = await http<UpgradeStatus>(`/claude-chat/sidecar/upgrade?${query}`, { method: 'POST' })
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
        <fieldset disabled={busy} className="flex w-full flex-wrap items-center gap-2">
          <legend className="mb-2 font-medium">选择要检查升级的 SDK</legend>
          {SDK_OPTIONS.map(option => <label key={option.id}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 has-[:checked]:bg-[var(--color-accent)] has-[:focus-visible]:outline-2">
            <input type="checkbox" checked={engines.includes(option.id)} onChange={event => setEngines(current =>
              event.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} />
            {option.name}
          </label>)}
          <button type="button" className="min-h-10 px-2 underline focus-visible:outline-2"
            onClick={() => setEngines(SDK_OPTIONS.map(option => option.id))}>全选</button>
          <button type="button" className="min-h-10 px-2 underline focus-visible:outline-2"
            onClick={() => setEngines([])}>清空</button>
        </fieldset>
        <button type="button" disabled={busy || engines.length === 0} onClick={() => void upgrade()}
          className="flex h-8 items-center gap-2 rounded-md border px-3 hover:bg-[var(--color-accent)] focus-visible:outline-2 disabled:opacity-50">
          {busy ? <RefreshCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {busy ? '正在升级…' : `检查并升级所选 ${engines.length} 项`}
        </button>
        <button type="button" onClick={() => setRefresh(value => value + 1)}
          className="h-8 rounded-md px-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] focus-visible:outline-2">
          刷新状态
        </button>
      </div>
      <p className="mt-2 leading-relaxed text-[var(--color-muted-foreground)]">所选 SDK 一次安装、统一验证，通过后重连一次运行时；已是最新的包自动跳过。请在所有会话和后台任务结束后操作。</p>
      {status && status.phase !== 'IDLE' && <p role="status" className="mt-2 break-words leading-relaxed">{status.message}</p>}
      {error && <p role="alert" className="mt-2 text-[var(--color-destructive)]">{error}。可刷新状态后重试。</p>}
      {status?.logPath && <details className="mt-2 text-[var(--color-muted-foreground)]">
        <summary className="cursor-pointer">诊断日志位置</summary>
        <code className="mt-1 block break-all select-all">{status.logPath}</code>
      </details>}
    </div>
  )
}
