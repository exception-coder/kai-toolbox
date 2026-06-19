import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coins, Database, Loader2, X } from 'lucide-react'
import { fetchUsage, type EngineUsage, type SessionUsage, type UsageWindow } from '../api'
import { abbr } from '../lib/metrics'

const ENGINE_LABEL: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini' }
const WINDOWS: { key: 'today' | 'd7' | 'd30'; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'd7', label: '近 7 天' },
  { key: 'd30', label: '近 30 天' },
]

/** 引擎本地用量弹层：本会话用量拆分 + 三引擎卡片 + 窗口切换；Codex 额外显示官方额度。 */
export function UsagePanel({ onClose, session }: { onClose: () => void; session?: SessionUsage | null }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['claude-chat-usage'], queryFn: fetchUsage, staleTime: 30_000 })
  const [win, setWin] = useState<'today' | 'd7' | 'd30'>('today')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-2.5">
          <Coins className="size-4 text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">本地用量</span>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-[var(--color-background)] p-0.5">
            {WINDOWS.map(w => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWin(w.key)}
                className={`rounded-md px-2 py-1 text-xs ${win === w.key
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="ml-1 rounded p-1 hover:bg-[var(--color-background)]">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {session && session.turns > 0 && <SessionUsageCard s={session} />}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" /> 扫描本地会话日志…
            </div>
          )}
          {error && <div className="py-8 text-center text-sm text-[var(--color-destructive)]">加载失败</div>}
          {data && (
            <div className="flex flex-col gap-3">
              {data.map(e => <EngineCard key={e.engine} u={e} win={win} />)}
              <p className="px-1 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">
                Token 来自本机各 CLI 会话日志（只读），为实际消耗，缓存命中部分计费约 1/10。官方额度：Claude 调 /usage 端点、Codex 取本地 rollout；Gemini 本地无 token。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 本会话用量拆分：总吞吐(含缓存读) vs 实际消耗(不含缓存读) + 输入/输出/缓存读/缓存写。 */
function SessionUsageCard({ s }: { s: SessionUsage }) {
  const real = s.inputTokens + s.outputTokens + s.cacheCreateTokens // 不含缓存读（命中≈免费）
  const inputSide = s.inputTokens + s.cacheReadTokens + s.cacheCreateTokens
  const hit = inputSide > 0 ? Math.floor((s.cacheReadTokens / inputSide) * 100) : null
  const Row = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className={`tabular-nums font-medium ${tone ?? ''}`}>{value}</span>
    </div>
  )
  return (
    <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
      <div className="flex items-center gap-2">
        <Coins className="size-4 text-violet-600 dark:text-violet-400" />
        <span className="text-sm font-semibold">本会话用量</span>
        <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">{s.turns} 轮{hit != null ? ` · 命中 ${hit}%` : ''}</span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-y-1 text-xs sm:grid-cols-2 sm:gap-x-6">
        <Row label="总吞吐(含缓存读)" value={abbr(s.totalTokens)} tone="text-violet-600 dark:text-violet-400" />
        <Row label="实际消耗(不含缓存读)" value={abbr(real)} tone="text-emerald-600 dark:text-emerald-400" />
        <Row label="输入" value={abbr(s.inputTokens)} />
        <Row label="输出" value={abbr(s.outputTokens)} />
        <Row label="缓存读(命中≈免费)" value={abbr(s.cacheReadTokens)} />
        <Row label="缓存写" value={abbr(s.cacheCreateTokens)} />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">
        缓存读每次模型调用都把整段上下文重算计入，故「总吞吐」远大于「实际消耗」；计费主要看实际消耗（缓存读约 1/10 计费）。已含本会话全部 agent 段。
      </p>
    </div>
  )
}

function EngineCard({ u, win }: { u: EngineUsage; win: 'today' | 'd7' | 'd30' }) {
  const w: UsageWindow = u[win]
  const label = ENGINE_LABEL[u.engine] ?? u.engine
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {!u.available && <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">无本地数据</span>}
        {u.quota && <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">{u.quota.planType ?? 'plan'}</span>}
      </div>

      {/* 本地消耗 */}
      {u.hasTokens ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="inline-flex items-center gap-1 font-medium text-violet-600 dark:text-violet-400">
            <Coins className="size-3.5" />{abbr(w.total)}
          </span>
          {w.cacheHitRate != null && (
            <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400">
              <Database className="size-3.5" />命中 {Math.floor(w.cacheHitRate * 100)}%
            </span>
          )}
          <span className="text-xs text-[var(--color-muted-foreground)]">↑{abbr(w.input)} ↓{abbr(w.output)}</span>
          <span className="text-xs text-[var(--color-muted-foreground)]">{w.turns} 轮 · {w.sessions} 会话</span>
        </div>
      ) : (
        <div className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          {w.sessions} 会话 · {w.turns} 条
          <span className="ml-2 text-xs">（{u.note ?? '本地无 token 记录'}）</span>
        </div>
      )}

      {/* Codex 官方额度 */}
      {u.quota && (
        <div className="mt-2 flex flex-col gap-1 border-t border-[var(--color-border)] pt-2 text-xs">
          {u.quota.primaryUsedPercent != null && (
            <QuotaBar label="5 小时窗口" pct={u.quota.primaryUsedPercent} resetsAt={u.quota.primaryResetsAt} />
          )}
          {u.quota.secondaryUsedPercent != null && (
            <QuotaBar label="周窗口" pct={u.quota.secondaryUsedPercent} resetsAt={u.quota.secondaryResetsAt} />
          )}
          <span className="text-[10px] text-[var(--color-muted-foreground)]">官方账号额度</span>
        </div>
      )}
    </div>
  )
}

function QuotaBar({ label, pct, resetsAt }: { label: string; pct: number; resetsAt: number | null }) {
  const p = Math.max(0, Math.min(100, pct))
  const tone = p >= 90 ? 'bg-rose-500' : p >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[var(--color-muted-foreground)]">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums">{p.toFixed(0)}%</span>
      {resetsAt && <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">{resetLabel(resetsAt)}</span>}
    </div>
  )
}

/** resets_at 是 epoch 秒；显示「Xh 后重置」。 */
function resetLabel(resetsAtSec: number): string {
  const ms = resetsAtSec * 1000 - Date.now()
  if (ms <= 0) return '即将重置'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h 后重置` : `${m}m 后重置`
}
