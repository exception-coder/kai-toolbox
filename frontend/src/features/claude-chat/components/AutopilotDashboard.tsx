import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronRight, CirclePause, Clock3, Play, RefreshCw, Search, Square, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { controlSessionAutopilot, listAutopilotRuns } from '../api'
import type { AutopilotBindingCandidate, AutopilotDashboardItem } from '../types'

type Scope = 'all' | 'active' | 'attention' | 'paused' | 'recent'

interface AutopilotDashboardProps {
  onOpenSession: (sessionId: string) => void
  initialScope?: Scope
  recommendedChangeIds?: ReadonlySet<string>
  recommendationProjectRoot?: string
  suggestedChanges?: AutopilotBindingCandidate[]
}

const scopes: Array<{ id: Scope; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '监督中' },
  { id: 'attention', label: '待处理' },
  { id: 'paused', label: '已暂停' },
  { id: 'recent', label: '最近结束' },
]

function timeLabel(value: string | number): string {
  const time = typeof value === 'number' ? value : Date.parse(value)
  const delta = Math.max(0, Date.now() - time)
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  return new Date(time).toLocaleDateString()
}

function stateTone(state: AutopilotDashboardItem['run']['state']): string {
  if (state === 'ACTIVE') return 'text-emerald-700 dark:text-emerald-400'
  if (state === 'WAITING_USER' || state === 'FAILED') return 'text-amber-700 dark:text-amber-400'
  return 'text-[var(--color-muted-foreground)]'
}

/** 当前用户可访问的受监督会话运营看板。 */
export function AutopilotDashboard({ onOpenSession, initialScope = 'active', recommendedChangeIds,
  recommendationProjectRoot, suggestedChanges }: AutopilotDashboardProps) {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<Scope>(initialScope)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  const query = useQuery({
    queryKey: ['claude-chat-autopilot-runs', scope, search, cursor],
    queryFn: () => listAutopilotRuns({ scope, search, cursor, limit: 30 }),
    refetchInterval: document.visibilityState === 'visible' ? 15_000 : false,
    refetchIntervalInBackground: false,
  })
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-runs'] })
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('claude-chat:autopilot-changed', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('claude-chat:autopilot-changed', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [queryClient])
  const control = useMutation({
    mutationFn: ({ item, action }: { item: AutopilotDashboardItem; action: 'pause' | 'resume' | 'stop' }) =>
      controlSessionAutopilot(item.run.sessionId, action, item.run.version),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-runs'] }),
  })
  const snapshotStale = query.data ? Date.now() - Date.parse(query.data.snapshotAt) > 30_000 : false
  const countForScope = (id: Scope) => query.data?.counts
    ? id === 'all' ? Object.values(query.data.counts).reduce((sum, count) => sum + count, 0)
      : query.data.counts[id] : 0
  const isRecommended = (item: AutopilotDashboardItem) => Boolean(recommendedChangeIds?.has(item.run.changeId)
    && recommendationProjectRoot
    && item.run.projectRoot.toLowerCase() === recommendationProjectRoot.toLowerCase())
  const visibleItems = [...(query.data?.items ?? [])].sort((left, right) => Number(isRecommended(right)) - Number(isRecommended(left)))
  const recommendations = suggestedChanges?.filter(candidate => candidate.relevance > 0) ?? []
  const openRecommendation = async (changeId: string) => {
    const run = query.data?.items.find(item => item.run.changeId === changeId
      && item.run.projectRoot.toLowerCase() === recommendationProjectRoot?.toLowerCase())
    if (run) { onOpenSession(run.run.sessionId); return }
    try {
      const matches = await listAutopilotRuns({ scope: 'all', search: changeId, limit: 100 })
      const match = matches.items.find(item => item.run.changeId === changeId
        && item.run.projectRoot.toLowerCase() === recommendationProjectRoot?.toLowerCase())
      if (match) { onOpenSession(match.run.sessionId); return }
    } catch { /* Keep the filtered list as the recovery path. */ }
    setScope('all'); setSearch(changeId); setSearchDraft(changeId); setCursor(undefined)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--color-background)] max-md:overflow-y-auto max-md:overscroll-contain" aria-labelledby="autopilot-dashboard-title">
      <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-[var(--color-muted-foreground)]" />
              <h2 id="autopilot-dashboard-title" className="text-base font-semibold">自动监督会话</h2>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Forge 持续监督；单轮结束不代表任务完成。</p>
            {Boolean(recommendedChangeIds?.size) && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">推荐依据当前会话上下文，仅供定位。</p>}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            {snapshotStale && <span className="text-amber-700 dark:text-amber-400">快照可能已过期</span>}
            <span>{query.data ? `更新于 ${timeLabel(query.data.snapshotAt)}` : '正在读取快照'}</span>
            <button type="button" onClick={() => query.refetch()} className="rounded p-1.5 hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label="刷新监督看板"><RefreshCw className={cn('size-3.5', query.isFetching && 'animate-spin')} /></button>
          </div>
        </div>
        {recommendations.length > 0 && <div className="mt-4 border-t border-[var(--color-border)] pt-3">
          <div className="text-xs font-medium">当前会话相关的规格</div>
          <div className="mt-2 flex flex-wrap gap-2">{recommendations.map(candidate =>
            <button key={candidate.changeId} type="button" onClick={() => openRecommendation(candidate.changeId)}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-left text-xs hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
              <span className="font-medium">{candidate.changeId}</span><span className="ml-2 tabular-nums text-[var(--color-muted-foreground)]">{candidate.completedTasks}/{candidate.totalTasks}</span>
            </button>)}</div>
        </div>}
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <nav className="flex gap-1 overflow-x-auto" aria-label="监督会话范围">
            {scopes.map(item => (
              <button key={item.id} type="button" onClick={() => { setScope(item.id); setCursor(undefined) }} aria-current={scope === item.id ? 'page' : undefined} className={cn('shrink-0 border-b-2 px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]', scope === item.id ? 'border-[var(--color-primary)] font-medium text-[var(--color-foreground)]' : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')}>
                {item.label}<span className="ml-1.5 tabular-nums">{countForScope(item.id)}</span>
              </button>
            ))}
          </nav>
          <form className="relative w-full lg:w-72" onSubmit={event => { event.preventDefault(); setSearch(searchDraft.trim()); setCursor(undefined) }}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="搜索会话、项目或 change" className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] pl-8 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />
          </form>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto max-md:flex-none max-md:overflow-visible">
        {query.isLoading ? (
          <div className="px-6 py-10 text-sm text-[var(--color-muted-foreground)]">正在读取受监督会话…</div>
        ) : query.error ? (
          <div className="px-6 py-8"><div className="flex items-center gap-2 text-sm font-medium"><TriangleAlert className="size-4 text-amber-600" />监督看板读取失败</div><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">会话仍由服务端继续监督。请检查连接后重试。</p><Button size="sm" variant="outline" className="mt-3" onClick={() => query.refetch()}>重试</Button></div>
        ) : visibleItems.length ? (
          <>
            <div className="hidden min-w-[980px] grid-cols-[minmax(230px,1.3fr)_minmax(180px,1fr)_130px_110px_150px_126px] border-b border-[var(--color-border)] px-6 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted-foreground)] md:grid">
              <span>会话 / 项目</span><span>Change / Task</span><span>阶段</span><span>预算</span><span>最近活动</span><span className="text-right">操作</span>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {visibleItems.map(item => <DashboardRow key={item.run.id} item={item} recommended={isRecommended(item)} busy={control.isPending} onOpen={() => onOpenSession(item.run.sessionId)} onAction={action => control.mutate({ item, action })} />)}
            </div>
          </>
        ) : (
          <div className="px-6 py-12">
            <p className="text-sm font-medium">{search ? '没有找到对应的受监督会话' : '这个范围内没有受监督会话'}</p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{search ? '该规格可能尚未绑定推进会话。回到对话中打开“自动推进”，选择规格后即可在这里跟踪。' : '在任一开发会话中打开“自动推进”，选择 OpenSpec change 后会出现在这里。'}</p>
          </div>
        )}
      </div>
      {query.data?.nextCursor && (
        <footer className="border-t border-[var(--color-border)] px-6 py-3"><Button size="sm" variant="ghost" onClick={() => setCursor(query.data?.nextCursor ?? undefined)}>查看下一页</Button></footer>
      )}
    </section>
  )
}

function DashboardRow({ item, recommended, busy, onOpen, onAction }: { item: AutopilotDashboardItem; recommended: boolean; busy: boolean; onOpen: () => void; onAction: (action: 'pause' | 'resume' | 'stop') => void }) {
  const { run } = item
  const percentage = run.progress.totalTasks ? Math.round(run.progress.completedTasks / run.progress.totalTasks * 100) : 0
  const stateLabel = run.state === 'ACTIVE' ? '监督中' : run.state === 'WAITING_USER' ? '待处理'
    : run.state === 'PAUSED' ? '已暂停' : run.state === 'COMPLETED' ? '已完成'
      : run.state === 'FAILED' ? '失败' : run.state === 'STOPPED' ? '已停止' : run.state
  return (
    <article className="group hover:bg-[color-mix(in_srgb,var(--color-muted)_42%,transparent)]">
      <button type="button" onClick={onOpen}
        aria-label={`进入 ${item.sessionTitle}，${item.projectName}，${run.changeId}，${stateLabel}，已完成 ${run.progress.completedTasks}/${run.progress.totalTasks} 项${run.reason ? '，查看原因' : ''}`}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] md:hidden">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.sessionTitle}</span>
        {recommended && <span className="shrink-0 text-[11px] font-medium text-[var(--color-primary)]">推荐</span>}
        <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]">{run.progress.completedTasks}/{run.progress.totalTasks}</span>
        <span className={cn('shrink-0 text-xs font-medium', stateTone(run.state))}>{stateLabel}</span>
        <ChevronRight className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
      </button>
      <div className="hidden gap-2 px-6 py-3 md:grid md:min-w-[980px] md:grid-cols-[minmax(230px,1.3fr)_minmax(180px,1fr)_130px_110px_150px_126px] md:items-center">
        <button type="button" onClick={onOpen} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
          <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{item.sessionTitle}</span>{recommended && <span className="shrink-0 text-[11px] font-medium text-[var(--color-primary)]">推荐</span>}<ChevronRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" /></div>
          <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{item.projectName} · {item.engine}</div>
        </button>
        <div className="min-w-0"><div className="truncate text-xs font-medium">{run.changeId}</div><div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{run.currentTaskId ? `task ${run.currentTaskId}` : '无待执行 task'} · {run.progress.completedTasks}/{run.progress.totalTasks}</div></div>
        <div><div className={cn('text-xs font-medium', stateTone(run.state))}>{stateLabel}</div><div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{run.phase}</div></div>
        <div className="text-xs tabular-nums"><div>{run.turnCount}/{run.maxTurns} 轮</div><div className="mt-0.5 text-[var(--color-muted-foreground)]">{percentage}%</div></div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]"><Clock3 className="size-3.5" />{timeLabel(run.updatedAt)}</div>
        <div className="flex justify-start gap-1 md:justify-end">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onOpen}>进入</Button>
          {run.state === 'ACTIVE' ? <button type="button" disabled={busy} onClick={() => onAction('pause')} className="rounded p-1.5 hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-40" aria-label="暂停监督"><CirclePause className="size-3.5" /></button> : ['PAUSED', 'WAITING_USER', 'FAILED'].includes(run.state) ? <button type="button" disabled={busy} onClick={() => onAction('resume')} className="rounded p-1.5 hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-40" aria-label="恢复监督"><Play className="size-3.5" /></button> : null}
          {!['COMPLETED', 'STOPPED'].includes(run.state) && <button type="button" disabled={busy} onClick={() => onAction('stop')} className="rounded p-1.5 hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-40" aria-label="停止监督"><Square className="size-3" /></button>}
        </div>
      </div>
      {run.reason && (run.state === 'WAITING_USER' || run.state === 'FAILED') && <p className="hidden items-start gap-1.5 px-6 pb-3 text-xs text-amber-700 dark:text-amber-400 md:flex"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{run.reason}</p>}
    </article>
  )
}
