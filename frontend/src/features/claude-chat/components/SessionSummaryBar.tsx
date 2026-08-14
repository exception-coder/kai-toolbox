import { Activity } from 'lucide-react'
import type { SessionUsage } from '../api'
import { abbr } from '../lib/metrics'

interface SessionSummaryBarProps {
  usage: SessionUsage | null
  loading: boolean
  running: boolean
  onOpenDetails: () => void
}

/** 输入区底部的整会话摘要；完整统计来自后端 transcript，不依赖前端历史分页。 */
export function SessionSummaryBar({ usage, loading, running, onOpenDetails }: SessionSummaryBarProps) {
  if (loading) {
    return (
      <div className="border-t border-[var(--color-border)]/70 px-3 py-1.5 text-[11px] text-[var(--color-muted-foreground)]" aria-live="polite">
        {running ? '本轮执行中，完成后更新会话汇总…' : '正在汇总整个会话…'}
      </div>
    )
  }
  if (!usage || usage.turns === 0) return null

  const inputSide = usage.inputTokens + usage.cacheReadTokens + usage.cacheCreateTokens
  const cacheHitRate = inputSide > 0 ? Math.round(usage.cacheReadTokens / inputSide * 100) : null
  const extendedMetrics = usage.steps == null ? [] : [
    `${usage.steps} 步`,
    `模型 ${formatDuration(usage.modelDurationMs ?? null)}`,
    `工具 ${formatDuration(usage.toolDurationMs ?? null)}`,
    `首响应 ${formatDuration(usage.averageTtftMs ?? null)}`,
    usage.outputTokensPerSecond == null ? '速率 --' : `${formatRate(usage.outputTokensPerSecond)} tok/s`,
  ]
  const metrics = [
    `${usage.turns} 轮`,
    ...extendedMetrics,
    cacheHitRate == null ? '缓存命中 --' : `缓存命中 ${cacheHitRate}%`,
    `输入 ${abbr(usage.inputTokens + usage.cacheReadTokens + usage.cacheCreateTokens)} tok`,
    `输出 ${abbr(usage.outputTokens)} tok`,
  ]
  const description = `${metrics.join(' | ')}。步骤统计有效助手输出与工具调用；模型耗时为会话墙钟时间扣除可测工具耗时的估算值。`

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="group flex w-full min-w-0 items-center gap-2 border-t border-[var(--color-border)]/70 px-3 py-1.5 text-left text-[11px] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]"
      aria-label={`查看会话汇总详情：${description}`}
      title={description}
    >
      <Activity className="size-3.5 shrink-0 text-[var(--color-primary)]" />
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:thin]">
        {metrics.map((metric, index) => (
          <span key={metric}>
            {index > 0 && <span className="mx-2 text-[var(--color-border)]" aria-hidden="true">|</span>}
            <span className="tabular-nums">{metric}</span>
          </span>
        ))}
      </span>
      {running && <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400">本轮完成后刷新</span>}
    </button>
  )
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return '--'
  if (ms < 1_000) return `${Math.round(ms)}ms`
  const seconds = Math.round(ms / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  if (minutes < 60) return restSeconds > 0 ? `${minutes}m${restSeconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0 ? `${hours}h${restMinutes}m` : `${hours}h`
}

function formatRate(rate: number): string {
  if (rate >= 100) return String(Math.round(rate))
  return rate.toFixed(1).replace(/\.0$/, '')
}
