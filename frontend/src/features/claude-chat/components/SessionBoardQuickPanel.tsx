import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { listAutopilotRuns } from '../api'
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
export function SessionBoardQuickPanel({ currentSessionId, onOpenSession }: {
  currentSessionId: string | null; onOpenSession: (sessionId: string) => void
}) {
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')
  const [order, setOrder] = useState<string[]>([])
  const query = useQuery({
    queryKey: ['claude-chat-autopilot-runs', 'quick-board', user?.userId ?? 'local'],
    queryFn: ({ signal }) => listAutopilotRuns({ scope: 'all', limit: LIMIT }, signal),
    refetchInterval: 15_000, refetchIntervalInBackground: false, staleTime: 15_000, retry: false,
  })
  const { refetch } = query
  useEffect(() => {
    const refresh = () => { void refetch() }
    window.addEventListener('claude-chat:autopilot-changed', refresh)
    return () => window.removeEventListener('claude-chat:autopilot-changed', refresh)
  }, [refetch])
  const items = query.data?.items.slice(0, LIMIT) ?? []
  useEffect(() => {
    const ids = query.data?.items.slice(0, LIMIT).map(item => item.run.id) ?? []
    setOrder(previous => [...previous.filter(id => ids.includes(id)), ...ids.filter(id => !previous.includes(id))])
  }, [query.data?.items])
  const ordered = [...items].sort((left, right) => {
    const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? LIMIT : index }
    return rank(left.run.id) - rank(right.run.id)
  })
  const updatedAt = Date.parse(query.data?.snapshotAt ?? '')
  const stale = Boolean(query.data && (!Number.isFinite(updatedAt) || Date.now() - updatedAt > 30_000))
  const refreshAndOrder = async () => {
    const result = await refetch()
    if (result.data && !result.isError) setOrder(result.data.items.slice(0, LIMIT).map(item => item.run.id))
  }
  return <section aria-label="最近规划执行状态" className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex shrink-0 items-center justify-between gap-2 px-4 text-xs text-[var(--color-muted-foreground)]">
      <span>{query.data ? `最近 ${items.length} 项规划` : '最近规划'}{Number.isFinite(updatedAt) && <span className="ml-2">{new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 快照</span>}</span>
      <Button variant="ghost" size="icon" className="size-11 shrink-0" disabled={query.isFetching} aria-label="刷新最近规划" onClick={() => { void refreshAndOrder() }}>
        <RefreshCw aria-hidden="true" className={cn('size-4', query.isFetching && 'animate-spin motion-reduce:animate-none')} />
      </Button>
    </div>
    {query.data && <div role="group" aria-label="规划状态筛选" className="grid shrink-0 grid-cols-4 gap-1 border-b px-3 pb-2">
      {filters.map(option => <button type="button" key={option.id} aria-pressed={filter === option.id}
        className={cn('min-h-11 rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
          filter === option.id ? 'bg-[var(--color-muted)] font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]')}
        onClick={() => setFilter(option.id)}>{option.label} <span className="tabular-nums">{items.filter(item => matches(item, option.id)).length}</span></button>)}
    </div>}
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {query.isPending && <p role="status" className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">正在读取规划状态…</p>}
      {(query.isError || stale) && <div role="alert" className="border-b px-4 py-2 text-xs text-[var(--color-warning-soft-foreground)]">
        {query.isError ? '规划状态读取失败。' : '规划快照已过期。'}{query.data ? '当前显示上次结果。' : '请检查连接后重试。'}
        <button type="button" className="ml-2 min-h-11 underline underline-offset-4" disabled={query.isFetching} onClick={() => { void refreshAndOrder() }}>重新读取</button>
      </div>}
      {query.data && (ordered.some(item => matches(item, filter)) ? <ul className="divide-y divide-[var(--color-border)]">
        {ordered.filter(item => matches(item, filter)).map(item => {
          const status = stateLabels[item.run.state] ?? { label: '状态待核对', tone: 'warning' as const }
          const requirement = item.run.completionPolicy === 'REQUIREMENT_BEST_EFFORT'
          const title = item.run.goal?.trim() || item.sessionTitle || item.run.changeId
          return <li key={item.run.id}>
            <button type="button" onClick={() => onOpenSession(item.run.sessionId)}
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
              {item.run.reason && ['FAILED', 'WAITING_USER', 'PAUSED'].includes(item.run.state) && <p className="mt-1 line-clamp-2 break-words text-xs text-[var(--color-muted-foreground)]">{item.run.reason}</p>}
            </button>
          </li>
        })}
      </ul> : <p className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">{items.length ? `最近 ${items.length} 项中暂无${filters.find(option => option.id === filter)?.label}规划` : '还没有受监督的规划，可从完整看板返回会话配置自动推进。'}</p>)}
      {query.data?.nextCursor && <p className="px-4 py-2 text-xs text-[var(--color-muted-foreground)]">更早的规划请在完整看板查看。</p>}
    </div>
  </section>
}
