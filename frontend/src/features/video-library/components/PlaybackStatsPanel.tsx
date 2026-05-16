import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, Loader2, RefreshCw, Zap, ZapOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { formatBytes, cn } from '@/lib/utils'
import { getPlaybackStats, setHlsOptimization } from '../api'
import type { PlaybackStats, SegmentStat } from '../types'

/** One HLS segment is 10s on the backend; "speed" = realtime-relative throughput. */
const SEGMENT_SECONDS = 10

interface Props {
  /** When false, polling stops — the panel keeps showing the last fetched snapshot. */
  active: boolean
}

/**
 * Read-only overlay for {@code /api/treesize/playback-stats}. Polls every 2s while open so the
 * recent-segments list reflects what hls.js just asked the backend to transcode.
 */
export function PlaybackStatsPanel({ active }: Props) {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const query = useQuery({
    queryKey: ['playback-stats'],
    queryFn: getPlaybackStats,
    refetchInterval: active && autoRefresh ? 2000 : false,
    enabled: active,
  })

  const stats = query.data
  const errorMsg = query.error
    ? (query.error instanceof ApiError ? query.error.message : String(query.error))
    : null

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <div>
            <div className="text-base font-semibold">转码监控</div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              最近 50 段 · 每 2 秒自动刷新
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(v => !v)}
            className="h-7 px-2 text-xs"
          >
            {autoRefresh ? '自动刷新中' : '已暂停'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="h-7 w-7 p-0"
            aria-label="手动刷新"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {query.isLoading && !stats ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : errorMsg && !stats ? (
          <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-3 py-2 text-xs text-[var(--color-destructive)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-medium">读取失败</div>
              <div className="mt-0.5 break-words text-[var(--color-destructive)]/80">{errorMsg}</div>
            </div>
          </div>
        ) : stats ? (
          <div className="space-y-4">
            <OptimizationToggleCard stats={stats} />
            <ActiveProcessCard count={stats.activeFfmpeg} />
            <RecentSegmentsList segments={stats.recentSegments} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function OptimizationToggleCard({ stats }: { stats: PlaybackStats }) {
  const enabled = stats.optimizationEnabled
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: boolean) => setHlsOptimization(next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['playback-stats'] }),
  })

  const Icon = enabled ? Zap : ZapOff
  const toneBg = enabled
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : 'border-amber-500/40 bg-amber-500/5'
  const toneIcon = enabled
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400'

  return (
    <div className={cn('rounded-md border px-4 py-3 transition-colors', toneBg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneIcon)} />
          <div>
            <div className="text-sm font-semibold">
              {enabled ? '优化模式 · CUDA + NVENC + 预热' : '对照模式 · CPU 软编，无预热'}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
              {enabled
                ? '播放前两段走内存缓存，余下走 NVENC 硬编。播一个视频后看下方 mode=prewarm / transcode 与速度对比。'
                : '强制走 libx264 ultrafast 软编、关闭预热。切回优化模式可立刻对比 firstByte / 总耗时差异。'}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={enabled ? 'outline' : 'default'}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(!enabled)}
          className="h-7 shrink-0 px-2 text-xs"
        >
          {mutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : enabled ? '切到对照' : '开启优化'}
        </Button>
      </div>
      {mutation.error && (
        <div className="mt-2 text-[11px] text-[var(--color-destructive)]">
          切换失败：{mutation.error instanceof ApiError ? mutation.error.message : String(mutation.error)}
        </div>
      )}
    </div>
  )
}

function ActiveProcessCard({ count }: { count: number }) {
  // 0 = quiet; 1-2 = playback baseline; ≥3 = competing with thumbnail warmer or seek storm.
  const tone =
    count === 0 ? 'text-[var(--color-muted-foreground)]'
      : count <= 2 ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-600 dark:text-amber-400'
  return (
    <div className="rounded-md border bg-[var(--color-card)] px-4 py-3">
      <div className="text-xs text-[var(--color-muted-foreground)]">当前活跃 FFmpeg / FFprobe 进程</div>
      <div className={cn('mt-1 font-mono text-3xl font-semibold tabular-nums', tone)}>{count}</div>
      <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
        含播放转码 + 缩略图预热 + 字幕抽音 + 字幕生成全部 ffmpeg/ffprobe 子进程
      </div>
    </div>
  )
}

function RecentSegmentsList({ segments }: { segments: SegmentStat[] }) {
  if (segments.length === 0) {
    return (
      <div className="rounded-md border bg-[var(--color-card)] px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
        暂无转码记录。播放一个非原生格式（mkv / avi / wmv 等）后此处会出现段统计。
      </div>
    )
  }
  const summary = computeSummary(segments)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">最近转码段</div>
        <div className="text-[11px] text-[var(--color-muted-foreground)]">共 {segments.length} 条</div>
      </div>
      <div className="mb-2 grid grid-cols-4 gap-2 text-[11px]">
        <SummaryCell label="平均速度" value={summary.avgSpeedText} tone={summary.speedTone} />
        <SummaryCell label="prewarm 命中" value={`${summary.prewarmPercent}%`} tone={summary.prewarmPercent > 0 ? 'good' : 'default'} />
        <SummaryCell label="copy 占比" value={`${summary.copyPercent}%`} tone="default" />
        <SummaryCell label="客户端中断" value={`${summary.abortedCount}`} tone={summary.abortedCount > 0 ? 'warn' : 'default'} />
      </div>
      <ul className="space-y-2">
        {segments.map(s => <SegmentRow key={`${s.at}-${s.idx}`} segment={s} />)}
      </ul>
    </div>
  )
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone: 'default' | 'good' | 'warn' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
        : tone === 'bad' ? 'text-[var(--color-destructive)]'
          : 'text-[var(--color-foreground)]'
  return (
    <div className="rounded border bg-[var(--color-muted)]/30 px-2 py-1.5">
      <div className="text-[10px] text-[var(--color-muted-foreground)]">{label}</div>
      <div className={cn('mt-0.5 font-mono text-sm font-medium tabular-nums', toneClass)}>{value}</div>
    </div>
  )
}

function SegmentRow({ segment }: { segment: SegmentStat }) {
  const speed = computeSpeed(segment.totalMs)
  const speedTone = speedToTone(speed)
  return (
    <li className="rounded-md border bg-[var(--color-card)] px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">#{segment.idx}</span>
        <Badge
          variant={segment.mode === 'copy' ? 'success' : segment.mode === 'prewarm' ? 'default' : 'secondary'}
          className="h-4 px-1.5 text-[10px]"
        >
          {segment.mode}
        </Badge>
        {segment.aborted && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">aborted</Badge>}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-muted-foreground)]">{formatTime(segment.at)}</span>
      </div>
      <div className="mt-1 truncate font-mono text-[11px]" title={segment.file}>{segment.file}</div>
      <div className="mt-1.5 grid grid-cols-4 gap-x-2 gap-y-1 font-mono text-[10px] tabular-nums">
        <Metric label="spawn" value={formatMs(segment.spawnMs)} />
        <Metric label="首字节" value={formatMs(segment.firstByteMs)} />
        <Metric label="总耗时" value={formatMs(segment.totalMs)} tone={speedTone} />
        <Metric label="速度" value={speed === null ? '-' : `${speed.toFixed(2)}×`} tone={speedTone} />
      </div>
      <div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
        写出 {formatBytes(segment.bytesOut)}
      </div>
    </li>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
        : tone === 'bad' ? 'text-[var(--color-destructive)]'
          : 'text-[var(--color-foreground)]'
  return (
    <div>
      <div className="text-[var(--color-muted-foreground)]">{label}</div>
      <div className={cn('font-medium', toneClass)}>{value}</div>
    </div>
  )
}

function formatMs(ms: number): string {
  if (ms < 0) return '-'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

/** Realtime multiplier: how many seconds of content the segment produced per wall-clock second. */
function computeSpeed(totalMs: number): number | null {
  if (totalMs <= 0) return null
  return (SEGMENT_SECONDS * 1000) / totalMs
}

function speedToTone(speed: number | null): 'good' | 'warn' | 'bad' | undefined {
  if (speed === null) return undefined
  if (speed >= 2) return 'good'
  if (speed >= 1) return undefined
  if (speed >= 0.5) return 'warn'
  return 'bad'
}

function computeSummary(segments: SegmentStat[]) {
  const valid = segments.filter(s => s.totalMs > 0)
  const avgSpeed = valid.length > 0
    ? valid.reduce((acc, s) => acc + (SEGMENT_SECONDS * 1000) / s.totalMs, 0) / valid.length
    : null
  const copyCount = segments.filter(s => s.mode === 'copy').length
  const copyPercent = segments.length > 0 ? Math.round((copyCount / segments.length) * 100) : 0
  const prewarmCount = segments.filter(s => s.mode === 'prewarm').length
  const prewarmPercent = segments.length > 0 ? Math.round((prewarmCount / segments.length) * 100) : 0
  const abortedCount = segments.filter(s => s.aborted).length

  return {
    avgSpeedText: avgSpeed === null ? '-' : `${avgSpeed.toFixed(2)}×`,
    speedTone: (avgSpeed === null
      ? 'default'
      : avgSpeed >= 2 ? 'good'
        : avgSpeed >= 1 ? 'default'
          : avgSpeed >= 0.5 ? 'warn'
            : 'bad') as 'default' | 'good' | 'warn' | 'bad',
    copyPercent,
    prewarmPercent,
    abortedCount,
  }
}
