import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coins, Database, Loader2, RefreshCw, X } from 'lucide-react'
import { fetchUsage, type EngineUsage, type SessionUsage, type UsageWindow } from '../api'
import { abbr } from '../lib/metrics'

const ENGINE_LABEL: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity' }
const WINDOWS = [
  { key: 'today', label: '今日' }, { key: 'd7', label: '近 7 天' }, { key: 'd30', label: '近 30 天' },
] as const
type WindowKey = typeof WINDOWS[number]['key']

export function UsagePanel({ onClose, session }: { onClose: () => void; session?: SessionUsage | null }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}><UsageContent session={session} onClose={onClose} /></div>
}

export function UsageWorkspace({ session }: { session?: SessionUsage | null }) {
  return <UsageContent session={session} embedded />
}

function UsageContent({ session, embedded = false, onClose }: { session?: SessionUsage | null; embedded?: boolean; onClose?: () => void }) {
  const usageQuery = useQuery({ queryKey: ['claude-chat-usage'], queryFn: fetchUsage, staleTime: 30_000 })
  const [win, setWin] = useState<WindowKey>('today')
  return (
    <section role={embedded ? 'region' : 'dialog'} aria-label={embedded ? '会话用量' : '本地用量'}
      className={embedded ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]' : 'flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl'}
      onClick={event => event.stopPropagation()}>
      <header className="flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] px-5">
        <div><h2 className="text-sm font-semibold">用量</h2><p className="text-xs text-[var(--color-muted-foreground)]">本地日志统计与账号额度</p></div>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-[var(--color-muted)]/60 p-1" aria-label="统计时间范围">
          {WINDOWS.map(item => <button key={item.key} type="button" onClick={() => setWin(item.key)} aria-pressed={win === item.key}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${win === item.key ? 'bg-[var(--color-background)] font-medium text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`}>{item.label}</button>)}
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="关闭" className="rounded-md p-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"><X className="size-4" /></button>}
      </header>
      <div className="flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-5xl px-5 py-6">
        {session && session.turns > 0 ? <SessionUsageSection usage={session} /> : <p className="border-b border-[var(--color-border)] pb-6 text-sm text-[var(--color-muted-foreground)]">当前会话尚未产生可统计的模型用量。</p>}
        <section className="pt-6" aria-labelledby="usage-range-heading">
          <div className="flex items-end justify-between gap-4"><div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">{WINDOWS.find(item => item.key === win)?.label}</p><h3 id="usage-range-heading" className="mt-1 text-base font-semibold">引擎汇总</h3></div>
            {!usageQuery.isLoading && !usageQuery.error && <span className="text-xs text-[var(--color-muted-foreground)]">{usageQuery.data?.length ?? 0} 个引擎</span>}</div>
          {usageQuery.isLoading && <div role="status" className="mt-5 flex items-center gap-2 border-t border-[var(--color-border)] py-6 text-sm text-[var(--color-muted-foreground)]"><Loader2 className="size-4 animate-spin" />正在读取本地会话日志…</div>}
          {usageQuery.error && <div role="alert" className="mt-5 border-t border-[var(--color-border)] py-6"><p className="text-sm font-medium">用量汇总暂时不可用</p><p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">当前会话数据仍可查看。请检查本地日志访问状态后重试。</p><button type="button" onClick={() => void usageQuery.refetch()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"><RefreshCw className="size-3.5" />重新读取</button></div>}
          {usageQuery.data && usageQuery.data.length > 0 && <div className="mt-4 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">{usageQuery.data.map(engine => <EngineUsageRow key={engine.engine} usage={engine} win={win} />)}</div>}
          {usageQuery.data?.length === 0 && <div className="mt-5 border-t border-[var(--color-border)] py-6"><p className="text-sm font-medium">尚无本地汇总数据</p><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">完成一次模型调用后，此处会按引擎显示 Token、会话和额度。</p></div>}
          <details className="mt-5 text-xs text-[var(--color-muted-foreground)]"><summary className="w-fit cursor-pointer select-none font-medium text-[var(--color-foreground)] hover:underline">统计口径</summary><p className="mt-2 max-w-3xl leading-relaxed">Token 来自本机 CLI 会话日志，只读统计实际模型调用；缓存读仍属于吞吐，但通常以较低价格计费。账号额度来自引擎可提供的官方额度接口或本地 rollout，成本仅作参考，不代表最终账单。</p></details>
        </section>
      </div></div>
    </section>
  )
}

const OPUS_PRICE = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }
const USD_TO_CNY = 7.2

function SessionUsageSection({ usage }: { usage: SessionUsage }) {
  const real = usage.inputTokens + usage.outputTokens + usage.cacheCreateTokens
  const inputSide = usage.inputTokens + usage.cacheReadTokens + usage.cacheCreateTokens
  const hit = inputSide > 0 ? Math.floor((usage.cacheReadTokens / inputSide) * 100) : null
  const costUsd = (usage.inputTokens * OPUS_PRICE.input + usage.outputTokens * OPUS_PRICE.output + usage.cacheCreateTokens * OPUS_PRICE.cacheWrite + usage.cacheReadTokens * OPUS_PRICE.cacheRead) / 1e6
  const costCny = costUsd * USD_TO_CNY
  const cost = `¥${costCny < 1 ? costCny.toFixed(2) : Math.round(costCny).toLocaleString()}`
  return <section className="border-b border-[var(--color-border)] pb-6" aria-labelledby="session-usage-heading">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">当前会话</p><h3 id="session-usage-heading" className="mt-1 text-base font-semibold">本会话用量</h3></div><p className="text-xs text-[var(--color-muted-foreground)]">{usage.turns} 轮{hit != null ? ` · 缓存命中 ${hit}%` : ''}</p></div>
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]"><div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      <Metric label="总吞吐" value={abbr(usage.totalTokens)} hint="含缓存读" primary /><Metric label="实际消耗" value={abbr(real)} hint="不含缓存读" /><Metric label="输入 / 输出" value={`${abbr(usage.inputTokens)} / ${abbr(usage.outputTokens)}`} /><Metric label="缓存读" value={abbr(usage.cacheReadTokens)} /><Metric label="缓存写" value={abbr(usage.cacheCreateTokens)} /><Metric label="模型步骤" value={String(usage.steps ?? usage.turns)} hint={usage.steps == null ? '按轮次计' : undefined} />
    </div><div className="border-t border-[var(--color-border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><p className="text-xs font-medium text-[var(--color-muted-foreground)]">成本参照上限</p><p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">≈ {cost}</p><p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">按 Opus 官方单价与汇率 7.2 估算。模型、服务商和缓存策略不同，实际账单可能更低。</p></div></div>
  </section>
}

function Metric({ label, value, hint, primary = false }: { label: string; value: string; hint?: string; primary?: boolean }) {
  return <div className="min-w-0"><p className="text-xs text-[var(--color-muted-foreground)]">{label}</p><p className={`mt-1 truncate text-lg font-semibold tabular-nums tracking-tight ${primary ? 'text-[var(--color-primary)]' : ''}`} title={value}>{value}</p>{hint && <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">{hint}</p>}</div>
}

function EngineUsageRow({ usage, win }: { usage: EngineUsage; win: WindowKey }) {
  const window: UsageWindow = usage[win]
  return <article className="py-4"><div className="flex flex-wrap items-start gap-x-4 gap-y-2"><div className="min-w-32"><h4 className="text-sm font-semibold">{ENGINE_LABEL[usage.engine] ?? usage.engine}</h4><p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{usage.available ? `${window.sessions} 会话 · ${window.turns} 轮` : '没有可读取的本地数据'}</p></div>
    {usage.hasTokens ? <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4"><CompactMetric label="Token" value={abbr(window.total)} icon={<Coins className="size-3.5" />} /><CompactMetric label="输入 / 输出" value={`${abbr(window.input)} / ${abbr(window.output)}`} /><CompactMetric label="缓存命中" value={window.cacheHitRate == null ? '—' : `${Math.floor(window.cacheHitRate * 100)}%`} icon={<Database className="size-3.5" />} /><CompactMetric label="活跃" value={`${window.sessions} 会话`} /></div> : <p className="flex-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">{usage.note ?? '日志中没有 Token 明细。'}</p>}
    {usage.quota?.planType && <span className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-muted-foreground)]">{usage.quota.planType}</span>}</div>
    {usage.quota && <div className="mt-4 space-y-2 border-t border-dashed border-[var(--color-border)] pt-3">{usage.quota.primaryUsedPercent != null && <QuotaBar windowMinutes={usage.quota.primaryWindowMinutes} pct={usage.quota.primaryUsedPercent} resetsAt={usage.quota.primaryResetsAt} delta={usage.quota.primaryDeltaPercent} />}{usage.quota.secondaryUsedPercent != null && <QuotaBar windowMinutes={usage.quota.secondaryWindowMinutes} pct={usage.quota.secondaryUsedPercent} resetsAt={usage.quota.secondaryResetsAt} delta={usage.quota.secondaryDeltaPercent} />}</div>}
  </article>
}

function CompactMetric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div><p className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">{icon}{label}</p><p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p></div>
}

function QuotaBar({ windowMinutes, pct, resetsAt, delta }: { windowMinutes: number | null; pct: number; resetsAt: number | null; delta?: number | null }) {
  const percentage = Math.max(0, Math.min(100, pct)); const tone = percentage >= 90 ? 'bg-rose-500' : percentage >= 60 ? 'bg-amber-500' : 'bg-emerald-500'; const showDelta = delta != null && Math.abs(delta) >= 0.5
  return <div className="grid grid-cols-[5rem_minmax(5rem,1fr)_2.5rem_auto] items-center gap-2 text-xs"><span className="text-[var(--color-muted-foreground)]">{quotaWindowLabel(windowMinutes)}</span><div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]" aria-label={`${quotaWindowLabel(windowMinutes)}已使用 ${percentage.toFixed(0)}%`}><div className={`h-full rounded-full ${tone}`} style={{ width: `${percentage}%` }} /></div><span className="text-right tabular-nums">{percentage.toFixed(0)}%</span><span className="min-w-16 text-right text-[10px] text-[var(--color-muted-foreground)]">{showDelta && <span className={delta! > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>{delta! > 0 ? '+' : ''}{Math.round(delta!)}% · </span>}{resetsAt ? resetLabel(resetsAt, windowMinutes) : '官方额度'}</span></div>
}

function quotaWindowLabel(minutes: number | null): string { if (!minutes || minutes <= 0) return '用量窗口'; if (minutes % 10_080 === 0) return `${minutes / 10_080} 周`; if (minutes % 1_440 === 0) return `${minutes / 1_440} 天`; if (minutes % 60 === 0) return `${minutes / 60} 小时`; return `${minutes} 分钟` }
function resetLabel(resetsAtSec: number, minutes: number | null): string { const ms = resetsAtSec * 1000 - Date.now(); if (ms <= 0) return '即将重置'; if (minutes != null && minutes >= 1_440) return `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(resetsAtSec * 1000))} 重置`; const hours = Math.floor(ms / 3_600_000); const mins = Math.floor((ms % 3_600_000) / 60_000); return hours > 0 ? `${hours}h 后` : `${mins}m 后` }
