import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import type { useRecentPlanningRuns } from '../hooks/useRecentPlanningRuns'
import type { AutopilotDashboardItem, AutopilotState } from '../types'

type Filter = 'all' | 'running' | 'completed' | 'error'
const LIMIT = 8
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' }, { id: 'running', label: '进行中' },
  { id: 'completed', label: '已完成' }, { id: 'error', label: '异常' },
]
const stateLabels: Record<AutopilotState, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: '进行中', tone: 'info' }, COMPLETED: { label: '已完成', tone: 'success' },
  FAILED: { label: '异常', tone: 'danger' }, WAITING_USER: { label: '待确认', tone: 'warning' },
  PAUSED: { label: '已暂停', tone: 'neutral' }, STOPPED: { label: '已停止', tone: 'neutral' },
}
function matches(item: AutopilotDashboardItem, filter: Filter) {
  return filter === 'all' || item.run.state === (filter === 'running' ? 'ACTIVE' : filter === 'completed' ? 'COMPLETED' : 'FAILED')
}

/** Compact projection of the existing supervised runs, not a second session or task store. */
export function SessionBoardQuickPanel({ query, refreshEpoch, onRefresh, currentSessionId, onOpenSession }: {
  query: ReturnType<typeof useRecentPlanningRuns>; refreshEpoch: number; onRefresh: () => Promise<void>
  currentSessionId: string | null; onOpenSession: (sessionId: string, changeId: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [order, setOrder] = useState<string[]>([])
  const items = query.data?.items.slice(0, LIMIT) ?? []
  useEffect(() => {
    const ids = query.data?.items.slice(0, LIMIT).map(item => item.run.id) ?? []
    setOrder(previous => [...previous.filter(id => ids.includes(id)), ...ids.filter(id => !previous.includes(id))])
  }, [query.data?.items])
  useEffect(() => {
    setOrder(query.data?.items.slice(0, LIMIT).map(item => item.run.id) ?? [])
    // Only an explicit refresh applies the latest ordering; automatic data updates keep row positions stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshEpoch])
  const ordered = [...items].sort((left, right) => {
    const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? LIMIT : index }
    return rank(left.run.id) - rank(right.run.id)
  })
  const updatedAt = Date.parse(query.data?.snapshotAt ?? '')
  const stale = Boolean(query.data && (!Number.isFinite(updatedAt) || Date.now() - updatedAt > 30_000))
  return <section aria-label="最近规划执行状态" className="flex min-h-0 flex-1 flex-col overflow-hidden">
    {query.data && <div role="group" aria-label="规划状态筛选" className="grid shrink-0 grid-cols-4 gap-1 border-b px-3 py-2">
      {filters.map(option => <button type="button" key={option.id} aria-pressed={filter === option.id}
        className={cn('min-h-11 rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
          filter === option.id ? 'bg-[var(--color-muted)] font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]')}
        onClick={() => setFilter(option.id)}>{option.label} <span className="tabular-nums">{items.filter(item => matches(item, option.id)).length}</span></button>)}
    </div>}
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {query.isPending && <p role="status" className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">正在读取规划状态…</p>}
      {(query.isError || stale) && <div role="alert" className="border-b px-4 py-2 text-xs text-[var(--color-warning-soft-foreground)]">
        {query.isError ? '规划状态读取失败。' : '规划快照已过期。'}{query.data ? '当前显示上次结果。' : '请检查连接后重试。'}
        <button type="button" className="ml-2 min-h-11 underline underline-offset-4" disabled={query.isFetching} onClick={() => { void onRefresh() }}>重新读取</button>
      </div>}
      {query.data && (ordered.some(item => matches(item, filter)) ? <ul className="divide-y divide-[var(--color-border)]">
        {ordered.filter(item => matches(item, filter)).map(item => {
          const status = stateLabels[item.run.state] ?? { label: '状态待核对', tone: 'warning' as const }
          const requirement = item.run.completionPolicy === 'REQUIREMENT_BEST_EFFORT'
          const title = item.run.goal?.trim() || item.sessionTitle || item.run.changeId
          return <li key={item.run.id}>
            <button type="button" onClick={() => onOpenSession(item.run.sessionId, item.run.changeId)}
              aria-label={`进入原会话：${title}`} aria-current={item.run.sessionId === currentSessionId ? 'true' : undefined}
              className="block min-h-11 w-full min-w-0 px-4 py-3 text-left hover:bg-[var(--color-muted)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]">
              <div className="flex items-center gap-2">
                <StatusBadge tone={status.tone} className="shrink-0">{status.label}</StatusBadge>
                {item.run.sessionId === currentSessionId && <span className="text-[11px] text-[var(--color-primary)]">当前</span>}
                <span className="ml-auto text-xs tabular-nums text-[var(--color-muted-foreground)]">{requirement ? item.run.state === 'COMPLETED' ? 'Agent 自验' : '需求推进' : `任务 ${item.run.progress.completedTasks}/${item.run.progress.totalTasks}`}</span>
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
              </div>
              <p className="mt-2 line-clamp-2 break-words text-sm font-medium [overflow-wrap:anywhere]" title={title}>{title}</p>
              <p className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]" title={`${item.projectName} · ${item.sessionTitle}`}>{item.projectName} · {item.sessionTitle}</p>
              <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">最近活动 {Number.isFinite(Date.parse(item.run.updatedAt)) ? new Date(item.run.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '时间未知'}</p>
            </button>
            {item.run.reason && ['FAILED', 'WAITING_USER', 'PAUSED'].includes(item.run.state) && <details className="px-4 pb-2 text-xs text-[var(--color-muted-foreground)]"><summary className="flex min-h-11 cursor-pointer items-center">查看状态说明</summary><p className="break-words pb-2 [overflow-wrap:anywhere]">{item.run.reason}</p></details>}
          </li>
        })}
      </ul> : <p className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">{items.length ? `最近 ${items.length} 项中暂无${filters.find(option => option.id === filter)?.label}规划` : '还没有受监督的规划，可从完整看板返回会话配置自动推进。'}</p>)}
      {query.data?.nextCursor && <p className="px-4 py-2 text-xs text-[var(--color-muted-foreground)]">更早的规划请在完整看板查看。</p>}
      {query.data && <p className="px-4 py-2 text-[11px] text-[var(--color-muted-foreground)]">仅显示最近 {items.length} 项规划；待处理为待确认或异常。</p>}
    </div>
  </section>
}
