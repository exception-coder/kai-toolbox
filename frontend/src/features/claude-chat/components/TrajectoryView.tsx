import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronLeft,
  Clock3,
  Loader2,
  Search,
  SquareMinus,
  SquarePlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import {
  deriveTrajectory,
  deriveTrajectoryTimeline,
  formatTrajectoryDuration,
  matchesTrajectoryQuery,
  safeStringify,
  type TrajectoryLane,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from '../lib/trajectory'

interface Props {
  items: ChatItem[]
  running: boolean
  loadingEarlier?: boolean
  exhausted?: boolean
  onLoadEarlier?: () => void
}

const DURATION_PREF_KEY = 'kai-toolbox:claude-chat:trajectory-duration'

const LANE_META: Record<TrajectoryLane, { label: string; color: string }> = {
  input: { label: 'Input', color: 'bg-blue-500' },
  model: { label: 'Model', color: 'bg-violet-500' },
  tools: { label: 'Tools', color: 'bg-amber-500' },
}

function loadDurationPreference(): boolean {
  try {
    return localStorage.getItem(DURATION_PREF_KEY) === '1'
  } catch {
    return false
  }
}

/** 会话轨迹：三泳道概览 + 可独立控制的 Assistant（Turns）和 Tool（Calls）明细。 */
export function TrajectoryView({ items, running, loadingEarlier, exhausted, onLoadEarlier }: Props) {
  const turns = useMemo(() => deriveTrajectory(items), [items])
  const [actualDuration, setActualDuration] = useState(loadDurationPreference)
  const [showTurns, setShowTurns] = useState(true)
  const [showCalls, setShowCalls] = useState(true)
  const [query, setQuery] = useState('')
  const timeline = useMemo(
    () => deriveTrajectoryTimeline(turns, actualDuration),
    [turns, actualDuration],
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredTurns = useMemo(() => normalizedQuery === ''
    ? turns
    : turns.filter(turn => turn.searchableText.includes(normalizedQuery)),
  [turns, normalizedQuery])

  useEffect(() => {
    try { localStorage.setItem(DURATION_PREF_KEY, actualDuration ? '1' : '0') } catch { /* 隐私模式下忽略 */ }
  }, [actualDuration])

  // 历史接口按消息条数分页，长轮次可能让首屏恰好从一串 Tool/Assistant 中间切开。
  // 进入轨迹后自动补到最近一个 USER 边界，确保最早展示的 Turn 不是残缺半轮；更早完整轮次仍由用户按需加载。
  const firstItemId = items[0]?.id
  const startsMidTurn = items.length > 0 && items[0].kind !== 'user'
  useEffect(() => {
    if (!startsMidTurn || loadingEarlier || exhausted || !onLoadEarlier) return
    onLoadEarlier()
  }, [startsMidTurn, firstItemId, loadingEarlier, exhausted, onLoadEarlier])

  const jumpToRecord = (record: TrajectoryRecord) => {
    document.getElementById(record.domId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-background)]">
      <div
        className="flex min-h-9 shrink-0 flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] px-2 py-1"
        role="toolbar"
        aria-label="轨迹展示选项"
      >
        <ToolbarToggle
          active={actualDuration}
          icon={<Clock3 className="size-3.5" />}
          label="Duration"
          title={actualDuration ? '按事件等宽展示' : '按实际耗时比例展示'}
          onClick={() => setActualDuration(value => !value)}
        />
        <ToolbarToggle
          active={showTurns}
          icon={showTurns ? <SquareMinus className="size-3.5" /> : <SquarePlus className="size-3.5" />}
          label="Turns"
          title={showTurns ? '隐藏 Assistant 过程' : '显示 Assistant 过程'}
          onClick={() => setShowTurns(value => !value)}
        />
        <ToolbarToggle
          active={showCalls}
          icon={showCalls ? <SquareMinus className="size-3.5" /> : <SquarePlus className="size-3.5" />}
          label="Calls"
          title={showCalls ? '隐藏 Tool 调用' : '显示 Tool 调用'}
          onClick={() => setShowCalls(value => !value)}
        />
        <label className="ml-auto flex h-7 min-w-36 flex-1 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-2 sm:max-w-64">
          <Search className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-muted-foreground)]"
            placeholder="搜索轨迹"
            aria-label="搜索轨迹"
          />
        </label>
      </div>

      <TrajectoryTimeline
        timeline={timeline}
        query={query}
        hasEarlier={!exhausted}
        loadingEarlier={loadingEarlier}
        onLoadEarlier={onLoadEarlier}
        onSelect={jumpToRecord}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!exhausted && (
          <div className="flex justify-center border-b border-[var(--color-border)] py-2">
            <button
              type="button"
              disabled={loadingEarlier}
              onClick={onLoadEarlier}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50"
            >
              {loadingEarlier ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronLeft className="size-3.5" />}
              {loadingEarlier ? '正在加载更早轨迹…' : '加载更早轨迹'}
            </button>
          </div>
        )}

        {filteredTurns.length > 0 ? filteredTurns.map(turn => (
          <TrajectoryTurnRows
            key={turn.id}
            turn={turn}
            query={query}
            showTurns={showTurns}
            showCalls={showCalls}
          />
        )) : (
          <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-[var(--color-muted-foreground)]">
            {items.length === 0
              ? running ? '轨迹正在生成…' : '当前会话还没有可展示的轨迹'
              : `没有匹配“${query.trim()}”的轨迹`}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolbarToggle({ active, icon, label, title, onClick }: {
  active: boolean
  icon: ReactNode
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors',
        active
          ? 'bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]'
          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function TrajectoryTimeline({ timeline, query, hasEarlier, loadingEarlier, onLoadEarlier, onSelect }: {
  timeline: ReturnType<typeof deriveTrajectoryTimeline>
  query: string
  hasEarlier: boolean
  loadingEarlier?: boolean
  onLoadEarlier?: () => void
  onSelect: (record: TrajectoryRecord) => void
}) {
  return (
    <div className="grid h-[58px] shrink-0 grid-cols-[4.5rem_minmax(0,1fr)] border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
      <div className="relative border-r border-[var(--color-border)] text-[10px] text-[var(--color-muted-foreground)]">
        {(Object.keys(LANE_META) as TrajectoryLane[]).map((lane, index) => (
          <span key={lane} className="absolute right-2" style={{ top: `${7 + index * 16}px` }}>
            {LANE_META[lane].label}
          </span>
        ))}
      </div>
      <div className="relative min-w-0 overflow-hidden">
        {hasEarlier && (
          <button
            type="button"
            onClick={onLoadEarlier}
            disabled={loadingEarlier}
            className="absolute inset-y-0 left-0 z-20 flex w-7 items-center bg-gradient-to-r from-[var(--color-background)] via-[var(--color-background)]/80 to-transparent pl-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-50"
            aria-label="加载更早轨迹"
            title="加载更早轨迹"
          >
            {loadingEarlier ? <Loader2 className="size-3 animate-spin" /> : <ChevronLeft className="size-3.5" />}
          </button>
        )}
        {timeline.turnBoundaries.map((left, index) => (
          <span
            key={`${left}-${index}`}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-[var(--color-border)]"
            style={{ left: `${left}%` }}
          />
        ))}
        {timeline.spans.map(span => {
          const lane = span.record.lane!
          const matches = matchesTrajectoryQuery(span.record, query)
          return (
            <button
              key={`${span.record.id}-${span.record.domId}`}
              type="button"
              title={`${span.record.label} · ${compact(span.record.preview, 80)} · ${formatTrajectoryDuration(span.record.durationMs)}`}
              aria-label={`定位到 ${span.record.label} ${compact(span.record.preview, 60)}`}
              onClick={() => onSelect(span.record)}
              className={cn(
                'absolute h-2 min-w-0 rounded-[2px] transition-opacity hover:z-10 hover:ring-2 hover:ring-[var(--color-primary)]/40',
                LANE_META[lane].color,
                span.record.isError && 'bg-red-500',
                query.trim() && !matches && 'opacity-15',
              )}
              style={{
                top: `${8 + laneIndex(lane) * 16}px`,
                left: `${span.leftPercent}%`,
                width: span.equalWidth ? '8px' : `max(2px, calc(${Math.max(0.18, span.widthPercent)}% - 2px))`,
                transform: span.equalWidth ? 'translateX(-4px)' : undefined,
              }}
            />
          )
        })}
        {timeline.spans.length === 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-muted-foreground)]">暂无轨迹</span>
        )}
      </div>
    </div>
  )
}

function TrajectoryTurnRows({ turn, query, showTurns, showCalls }: {
  turn: TrajectoryTurn
  query: string
  showTurns: boolean
  showCalls: boolean
}) {
  const userRecords = turn.records.filter(record => record.item.kind === 'user')
  const detailRecords = turn.records.filter(record => {
    if (record.item.kind === 'user' || record.item.kind === 'result') return false
    if (record.item.kind === 'assistant') return showTurns
    if (record.item.kind === 'tool') return showCalls
    if (record.item.kind === 'activity') {
      if (record.lane === 'model' && !showTurns) return false
      if (record.lane === 'tools' && !showCalls) return false
      // 完成态 tool/turn 活动与正式 Tool/Assistant 行重复；其它 Codex 专属活动仍作为轨迹保留。
      return record.item.status !== 'completed'
        || (record.item.activityType !== 'tool' && record.item.activityType !== 'turn')
    }
    return true
  })
  const hiddenSteps = showTurns ? 0 : turn.steps
  const hiddenCalls = showCalls ? 0 : turn.calls
  const turnLabel = turn.number == null ? '片段' : `Turn ${turn.number}`

  return (
    <section className="grid grid-cols-[4.5rem_minmax(0,1fr)] border-b border-[var(--color-border)]">
      <div className="border-r border-[var(--color-border)] bg-[var(--color-muted)]/20 px-2 py-2 text-[10px] font-medium text-[var(--color-muted-foreground)]">
        <span>{turnLabel}</span>
      </div>
      <div className="min-w-0">
        {userRecords.map(record => <TrajectoryRecordRow key={record.id} record={record} query={query} />)}
        {detailRecords.map(record => <TrajectoryRecordRow key={record.id} record={record} query={query} />)}
        {(hiddenSteps > 0 || hiddenCalls > 0) && (
          <div className="flex min-h-8 items-center gap-2 border-t border-[var(--color-border)]/70 px-3 text-xs text-[var(--color-muted-foreground)]">
            <span>…</span>
            <span>
              {hiddenSteps > 0 && `${turn.steps} ${turn.steps === 1 ? 'step' : 'steps'}`}
              {hiddenSteps > 0 && hiddenCalls > 0 && ' · '}
              {hiddenCalls > 0 && `${turn.calls} tool ${turn.calls === 1 ? 'call' : 'calls'}`}
            </span>
            {turn.durationMs != null && <span className="ml-auto tabular-nums">{formatTrajectoryDuration(turn.durationMs)}</span>}
          </div>
        )}
      </div>
    </section>
  )
}

function TrajectoryRecordRow({ record, query }: { record: TrajectoryRecord; query: string }) {
  const item = record.item
  const highlighted = query.trim() !== '' && matchesTrajectoryQuery(record, query)
  const duration = record.durationMs != null ? formatTrajectoryDuration(record.durationMs) : null
  const tone = recordTone(record)

  if (item.kind === 'tool') {
    return (
      <details id={record.domId} className={cn('group border-t border-[var(--color-border)]/70 first:border-t-0', highlighted && 'bg-blue-50/60 dark:bg-blue-950/20')}>
        <summary className="grid min-h-9 cursor-pointer list-none grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1 text-xs marker:hidden">
          <KindBadge label="TOOL" tone={tone} />
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-semibold">{item.toolName || 'Tool'}</span>
            <code className="min-w-0 truncate text-[11px] text-[var(--color-muted-foreground)]">{compact(safeStringify(item.input), 180)}</code>
            {item.output !== undefined && (
              <>
                <span className="shrink-0 text-[var(--color-muted-foreground)]">→</span>
                <span className="min-w-0 truncate text-[var(--color-muted-foreground)]">{compact(item.output, 180) || 'No output'}</span>
              </>
            )}
          </div>
          <span className={cn('shrink-0 tabular-nums text-[10px]', item.isError ? 'text-red-600 dark:text-red-400' : 'text-[var(--color-muted-foreground)]')}>
            {item.output === undefined ? '运行中' : item.isError ? '错误' : duration}
          </span>
        </summary>
        <div className="grid gap-2 border-t border-[var(--color-border)]/60 bg-[var(--color-muted)]/20 p-3 lg:grid-cols-2">
          <DetailBlock title="Input" value={safeStringify(item.input)} />
          <DetailBlock title="Output" value={item.output ?? '运行中…'} />
        </div>
      </details>
    )
  }

  const detail = item.kind === 'assistant' || item.kind === 'user' ? record.detail : record.detail || record.preview
  return (
    <details id={record.domId} className={cn('group border-t border-[var(--color-border)]/70 first:border-t-0', highlighted && 'bg-blue-50/60 dark:bg-blue-950/20')}>
      <summary className="grid min-h-9 cursor-pointer list-none grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1 text-xs marker:hidden">
        <KindBadge label={record.label} tone={tone} />
        <span className="min-w-0 truncate text-sm">{compact(record.preview, 260) || '—'}</span>
        <span className="shrink-0 tabular-nums text-[10px] text-[var(--color-muted-foreground)]">{duration}</span>
      </summary>
      {detail && (
        <div className="border-t border-[var(--color-border)]/60 bg-[var(--color-muted)]/20 p-3">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{detail}</pre>
        </div>
      )}
    </details>
  )
}

function KindBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn('w-fit rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide', tone)}>{label}</span>
  )
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">{title}</div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-[11px] leading-relaxed">{value || '—'}</pre>
    </div>
  )
}

function recordTone(record: TrajectoryRecord): string {
  if (record.isError) return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
  if (record.item.kind === 'user') return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
  if (record.item.kind === 'assistant') return 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
  if (record.item.kind === 'tool') return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  if (record.item.kind === 'warning') return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
}

function compact(value: string, maxLength: number): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}…` : oneLine
}

function laneIndex(lane: TrajectoryLane): number {
  return lane === 'input' ? 0 : lane === 'model' ? 1 : 2
}
