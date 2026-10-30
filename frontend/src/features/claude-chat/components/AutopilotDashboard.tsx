import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, CirclePause, Clock3, Play, RefreshCw, Search, Square, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { controlSessionAutopilot, getAutopilotBatch, getSessionAutopilot, listAutopilotRuns } from '../api'
import { ProjectExecutionControl } from './ProjectExecutionControl'
import type { AutopilotDashboardItem } from '../types'

type Scope = 'all' | 'active' | 'attention' | 'paused' | 'recent'

interface AutopilotDashboardProps {
  onBackToConversation: () => void
  onOpenSession: (sessionId: string, changeId?: string) => void
  initialScope?: Scope
  currentSessionId?: string
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
export function AutopilotDashboard({ onBackToConversation, onOpenSession, initialScope = 'active', currentSessionId }: AutopilotDashboardProps) {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<Scope>(initialScope)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  const query = useQuery({
    queryKey: ['claude-chat-autopilot-runs', scope, search, cursor],
    queryFn: () => listAutopilotRuns({ scope, search, cursor, limit: 30 }),
    refetchInterval: document.visibilityState === 'visible' ? 15_000 : false,
    refetchIntervalInBackground: false,
  })
  const binding = useQuery({
    queryKey: ['claude-chat-autopilot-binding', currentSessionId],
    queryFn: async () => {
      const run = await getSessionAutopilot(currentSessionId!)
      if (!run || run.completionPolicy === 'REQUIREMENT_BEST_EFFORT') return []
      const batch = await getAutopilotBatch(currentSessionId!)
      return batch?.changeIds ?? [run.changeId]
    },
    enabled: Boolean(currentSessionId),
  })
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-binding'] })
    }
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
  const boundIds = new Set(binding.data ?? [])
  const isBoundHere = (item: AutopilotDashboardItem) => Boolean(currentSessionId
    && item.run.sessionId === currentSessionId && boundIds.has(item.run.changeId))
  const visibleItems = [...(query.data?.items ?? [])].sort((left, right) => Number(isBoundHere(right)) - Number(isBoundHere(left)))

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]" aria-labelledby="autopilot-dashboard-title">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3 py-2 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onBackToConversation} className="min-h-11 shrink-0 gap-1.5 px-2">
          <ArrowLeft className="size-4" aria-hidden="true" />返回对话
        </Button>
        <div className="min-w-0 flex-1">
          <h2 id="autopilot-dashboard-title" className="truncate text-sm font-semibold">自动推进</h2>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {snapshotStale ? <span className="text-amber-700 dark:text-amber-400">快照可能已过期</span>
              : query.data ? `更新于 ${timeLabel(query.data.snapshotAt)}` : '正在读取进度'}
          </p>
        </div>
        <button type="button" onClick={() => query.refetch()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label="刷新监督看板">
          <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin motion-reduce:animate-none')} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="border-b border-[var(--color-border)] px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <label className="flex items-center gap-3 text-xs md:hidden">
              <span className="shrink-0 text-[var(--color-muted-foreground)]">会话范围</span>
              <select aria-label="监督会话范围" value={scope} onChange={event => { setScope(event.target.value as Scope); setCursor(undefined) }}
                className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
                {scopes.map(item => <option key={item.id} value={item.id}>{item.label} · {countForScope(item.id)}</option>)}
              </select>
            </label>
            <nav className="hidden gap-1 overflow-x-auto md:flex" aria-label="监督会话范围">
              {scopes.map(item => (
                <button key={item.id} type="button" onClick={() => { setScope(item.id); setCursor(undefined) }} aria-current={scope === item.id ? 'page' : undefined} className={cn('shrink-0 border-b-2 px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]', scope === item.id ? 'border-[var(--color-primary)] font-medium text-[var(--color-foreground)]' : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')}>
                  {item.label}<span className="ml-1.5 tabular-nums">{countForScope(item.id)}</span>
                </button>
              ))}
            </nav>
            <form className="relative w-full lg:w-64" onSubmit={event => { event.preventDefault(); setSearch(searchDraft.trim()); setCursor(undefined) }}>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <input aria-label="搜索监督会话" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="搜索会话、项目或规格"
                className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />
            </form>
          </div>
          {currentSessionId && <div className="mt-2 flex flex-wrap items-start gap-x-6 text-xs">
            <details className="min-w-0 flex-1">
              <summary className="min-h-11 cursor-pointer content-center rounded-sm text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
                本会话规格{boundIds.size ? ` · ${boundIds.size} 项` : ''}
              </summary>
              {binding.isPending ? <p className="pb-3 text-[var(--color-muted-foreground)]">正在读取绑定记录…</p>
                : binding.isError ? <p className="pb-3 text-amber-700">绑定记录读取失败。<button type="button" className="ml-2 min-h-11 underline" onClick={() => binding.refetch()}>重试</button></p>
                  : boundIds.size ? <div className="flex flex-wrap gap-2 pb-3">{[...boundIds].map(changeId =>
                    <button key={changeId} type="button" onClick={() => onOpenSession(currentSessionId, changeId)}
                      className="min-h-11 max-w-full break-all rounded-md border border-[var(--color-border)] px-3 py-2 text-left hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">{changeId}</button>)}</div>
                    : <p className="pb-3 leading-relaxed text-[var(--color-muted-foreground)]">尚未绑定自动推进规格。<button type="button" className="ml-2 min-h-11 underline" onClick={onBackToConversation}>返回对话配置</button></p>}
            </details>
            <details className="min-w-0 basis-full" open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)}>
              <summary className="min-h-11 cursor-pointer content-center rounded-sm text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">项目设置 · 编码与验收</summary>
              {settingsOpen && <ProjectExecutionControl sessionId={currentSessionId} />}
            </details>
          </div>}
        </div>
        {control.isError && <p role="alert" className="border-b border-[var(--color-border)] px-4 py-3 text-xs text-amber-700 dark:text-amber-400">操作结果未确认，请刷新状态后再试。<button type="button" onClick={() => query.refetch()} className="ml-2 min-h-11 underline">刷新状态</button></p>}
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
              {visibleItems.map(item => <DashboardRow key={item.run.id} item={item} boundHere={isBoundHere(item)} busy={control.isPending} onOpen={() => onOpenSession(item.run.sessionId)} onAction={action => control.mutate({ item, action })} />)}
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

function DashboardRow({ item, boundHere, busy, onOpen, onAction }: { item: AutopilotDashboardItem; boundHere: boolean; busy: boolean; onOpen: () => void; onAction: (action: 'pause' | 'resume' | 'stop') => void }) {
  const { run } = item
  const requirement = run.completionPolicy === 'REQUIREMENT_BEST_EFFORT'
  const percentage = run.progress.totalTasks ? Math.round(run.progress.completedTasks / run.progress.totalTasks * 100) : 0
  const stateLabel = run.state === 'ACTIVE' ? '监督中' : run.state === 'WAITING_USER' ? '待处理'
    : run.state === 'PAUSED' ? '已暂停' : run.state === 'COMPLETED' ? requirement ? 'Agent 自验完成' : '已完成'
      : run.state === 'FAILED' ? '失败' : run.state === 'STOPPED' ? '已停止' : run.state
  return (
    <article className="group hover:bg-[color-mix(in_srgb,var(--color-muted)_42%,transparent)]">
      <button type="button" onClick={onOpen}
        aria-label={`进入 ${item.sessionTitle}，${item.projectName}，${run.changeId}，${stateLabel}，已完成 ${run.progress.completedTasks}/${run.progress.totalTasks} 项${run.reason ? '，查看原因' : ''}`}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] md:hidden">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.sessionTitle}</span>
        {boundHere && <span className="shrink-0 text-[11px] font-medium text-[var(--color-primary)]">本会话</span>}
        <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]">{requirement ? '需求' : `${run.progress.completedTasks}/${run.progress.totalTasks}`}</span>
        <span className={cn('shrink-0 text-xs font-medium', stateTone(run.state))}>{stateLabel}</span>
        <ChevronRight className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
      </button>
      <div className="hidden gap-2 px-6 py-3 md:grid md:min-w-[980px] md:grid-cols-[minmax(230px,1.3fr)_minmax(180px,1fr)_130px_110px_150px_126px] md:items-center">
        <button type="button" onClick={onOpen} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
          <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{item.sessionTitle}</span>{boundHere && <span className="shrink-0 text-[11px] font-medium text-[var(--color-primary)]">本会话</span>}<ChevronRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" /></div>
          <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{item.projectName} · {item.engine}</div>
        </button>
        <div className="min-w-0"><div className="truncate text-xs font-medium">{requirement ? '需求持续推进' : run.changeId}</div><div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{requirement ? run.goal : `${run.currentTaskId ? `task ${run.currentTaskId}` : '无待执行 task'} · ${run.progress.completedTasks}/${run.progress.totalTasks}`}</div></div>
        <div><div className={cn('text-xs font-medium', stateTone(run.state))}>{stateLabel}</div><div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{run.phase}</div></div>
        <div className="text-xs tabular-nums"><div>{run.turnCount}/{run.maxTurns} 轮</div><div className="mt-0.5 text-[var(--color-muted-foreground)]">{requirement ? 'Agent 自验' : `${percentage}%`}</div></div>
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
