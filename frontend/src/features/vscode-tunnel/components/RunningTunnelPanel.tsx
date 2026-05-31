import { useEffect, useState } from 'react'
import { Activity, Cpu, Loader2, Search, Skull } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CommandResult, TunnelState, TunnelStatus } from '../types'

interface Props {
  status: TunnelStatus | null
}

// 后端是单例模型（TunnelManager 只持有一个 process 字段），所以"列表"最多 1 行
export function RunningTunnelPanel({ status }: Props) {
  const state: TunnelState = status?.state ?? 'STOPPED'
  const visibleAsRow = state !== 'STOPPED'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Activity className="size-4" />
            当前运行的隧道
          </span>
          <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
            {visibleAsRow ? '1 / 1（架构限制：同时仅 1 条）' : '0 / 1'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleAsRow && status ? (
          <TunnelRow status={status} />
        ) : (
          <div className="rounded-md border border-dashed bg-[var(--color-muted)] px-3 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
            暂无运行中的隧道
          </div>
        )}
        <ResidueScanSection currentState={state} />
      </CardContent>
    </Card>
  )
}

function TunnelRow({ status }: { status: TunnelStatus }) {
  const uptime = useUptime(status.startedAt)
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-[var(--color-muted)]/40 px-3 py-3 text-sm">
      <StateBadge state={status.state} />
      <Field label="名称" value={status.tunnelName ?? '—'} mono />
      <Field
        label="PID"
        value={status.pid != null ? String(status.pid) : '—'}
        mono
        icon={<Cpu className="size-3" />}
      />
      <Field label="启动于" value={formatStartedAt(status.startedAt)} />
      <Field label="运行时长" value={uptime} />
      {status.tunnelUrl && (
        <div className="basis-full min-w-0">
          <div className="text-xs text-[var(--color-muted-foreground)]">URL</div>
          <div className="truncate font-mono text-xs">{status.tunnelUrl}</div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  mono,
  icon,
}: {
  label: string
  value: string
  mono?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
        {icon}
        {label}
      </div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
    </div>
  )
}

function StateBadge({ state }: { state: TunnelState }) {
  const cfg = STATE_STYLE[state]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

const STATE_STYLE: Record<TunnelState, { label: string; cls: string; dot: string }> = {
  STOPPED: { label: '已停止', cls: 'border-[var(--color-border)] text-[var(--color-muted-foreground)]', dot: 'bg-[var(--color-muted-foreground)]' },
  STARTING: { label: '启动中', cls: 'border-amber-300 bg-amber-50 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
  AUTH_REQUIRED: { label: '待授权', cls: 'border-amber-300 bg-amber-50 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
  RUNNING: { label: '运行中', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
  STOPPING: { label: '停止中', cls: 'border-amber-300 bg-amber-50 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
  ERROR: { label: '异常', cls: 'border-red-300 bg-red-50 text-red-700', dot: 'bg-red-500' },
}

// 每秒滴答一次让运行时长走动
function useUptime(startedAt: string | null): string {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => tick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return '—'
  return formatDuration(Date.now() - start)
}

function formatDuration(ms: number): string {
  if (ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function formatStartedAt(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const hh = d.getHours().toString().padStart(2, '0')
    const mm = d.getMinutes().toString().padStart(2, '0')
    const ss = d.getSeconds().toString().padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return iso
  }
}

// 落地 RK5：扫描/清理上次 JVM 强退留下的孤儿 `code tunnel` daemon
function ResidueScanSection({ currentState }: { currentState: TunnelState }) {
  const [scanning, setScanning] = useState(false)
  const [killing, setKilling] = useState(false)
  const [result, setResult] = useState<CommandResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // R15 + UX：仅 STOPPED 才允许杀掉，否则会无差别杀掉本进程当前的隧道
  const canKill = currentState === 'STOPPED'

  async function scan() {
    setScanning(true)
    setError(null)
    try {
      const r = await fetch('/api/vscode-tunnel/residue')
      if (!r.ok) {
        setError(`${r.status} ${r.statusText}`)
        return
      }
      setResult((await r.json()) as CommandResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  async function killAll() {
    setKilling(true)
    setError(null)
    try {
      const r = await fetch('/api/vscode-tunnel/residue/kill', { method: 'POST' })
      if (!r.ok) {
        setError(`${r.status} ${r.statusText}`)
        return
      }
      const killResult = (await r.json()) as CommandResult
      setResult(killResult)
      // 杀完自动重扫一次确认
      await scan()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setKilling(false)
    }
  }

  return (
    <div className="rounded-md border border-dashed p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">遗留扫描</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            检测并清理上次 JVM 强制退出留下的孤儿 <code>code tunnel</code> daemon
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={scan} disabled={scanning || killing}>
            {scanning ? <Loader2 className="animate-spin" /> : <Search />}
            扫描
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={killAll}
            disabled={!canKill || scanning || killing}
            title={canKill ? '调用 code tunnel kill 杀掉本机所有 daemon' : '当前隧道运行中，请先点击"停止隧道"'}
          >
            {killing ? <Loader2 className="animate-spin" /> : <Skull />}
            杀掉遗留 daemon
          </Button>
        </div>
      </div>

      {!canKill && (
        <p className="mb-2 text-xs text-amber-600">
          当前隧道处于 {currentState} 状态，"杀掉"会一起杀掉本进程的隧道，已禁用。请先用上方「停止隧道」。
        </p>
      )}

      {error && (
        <pre className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700 whitespace-pre-wrap">{error}</pre>
      )}

      {result && (
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-muted-foreground)]">
            exitCode: <span className={result.exitCode === 0 ? 'text-emerald-600' : 'text-red-600'}>
              {result.exitCode}
            </span>
          </div>
          <pre className="max-h-48 overflow-auto rounded bg-[var(--color-muted)] px-2 py-1 text-xs whitespace-pre-wrap">
            {result.output || '(无输出)'}
          </pre>
        </div>
      )}
    </div>
  )
}
