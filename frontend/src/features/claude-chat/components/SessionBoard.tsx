import { useState } from 'react'
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { ArrowUpRight, Circle, ListTodo, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { listSessions } from '../api'
import { sessionDisplayName } from '../lib/sessionDisplayName'
import { resolveSessionProject } from '../lib/sessionProjectGroups'
import { boardSessionState, isBoardSessionRunning, readBoardQueue, recentBoardSessions, SESSION_BOARD_LIMIT, type SessionBoardQueue } from '../lib/sessionBoard'
import type { ClaudeChatSessionView } from '../types'
import { engineDisplayName } from './chatStatus'
import { EngineIcon } from './EngineIcon'
import { SessionImportBadge } from './SessionImportBadge'
import { SessionStorageLabel } from './SessionStorageLabel'
import { useSessionStorage } from '../hooks/useSessionStorage'
import type { SessionStorageView } from '../types'

type Scope = 'all' | 'running' | 'queued'
const REFRESH_INTERVAL_MS = 15_000

/** 最近开发会话与服务端待发送任务的只读投影；进入对象后复用既有对话入口。 */
export function SessionBoard({ currentSessionId, onOpenSession, onNewSession }: {
  currentSessionId: string | null
  onOpenSession: (sessionId: string, hintRunning: boolean) => void
  onNewSession: () => void
}) {
  const { user } = useAuth()
  const [scope, setScope] = useState<Scope>('all')
  const sessionQuery = useQuery({
    queryKey: ['claude-chat-sessions', 'board', user?.userId ?? 'local'],
    queryFn: listSessions,
    refetchInterval: REFRESH_INTERVAL_MS,
    retry: false,
  })
  const recent = recentBoardSessions(sessionQuery.data ?? [])
  const storage = useSessionStorage(recent)
  const queues = useQueries({
    queries: recent.map(session => ({
      queryKey: ['claude-chat-session-board-queue', user?.userId ?? 'local', session.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => readBoardQueue(session.id, signal),
      staleTime: REFRESH_INTERVAL_MS,
      refetchInterval: REFRESH_INTERVAL_MS,
      retry: false,
    })),
  })
  const runningCount = recent.filter(isBoardSessionRunning).length
  const queuedCount = queues.filter(queue => (queue.data?.count ?? 0) > 0).length
  const uncheckedCount = queues.filter(queue => !queue.data || queue.isError).length
  const fetching = sessionQuery.isFetching || queues.some(queue => queue.isFetching)
  const entries = recent.map((session, index) => ({ session, queue: queues[index] }))
    .filter(({ session, queue }) => scope === 'all'
      || (scope === 'running' ? isBoardSessionRunning(session) : !queue.data || queue.isError || queue.data.count > 0))
  const refresh = () => {
    void sessionQuery.refetch()
    queues.forEach(queue => { void queue.refetch() })
    storage.refresh()
  }

  return <section aria-label="最近会话看板" className="@container/session-board flex min-h-0 flex-1 flex-col bg-[var(--color-background)]">
    <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-3 md:px-6 md:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">会话看板</h2>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">最近 {SESSION_BOARD_LIMIT} 个 · 最新到最早 · 所有项目</p>
        </div>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={fetching} aria-label="刷新会话看板" className="min-h-9 shrink-0 gap-1.5">
          <RefreshCw aria-hidden="true" className={cn('size-3.5', fetching && 'animate-spin motion-reduce:animate-none')} />
          刷新
        </Button>
      </div>
      <div role="group" aria-label="筛选最近会话" className="mt-3 flex flex-wrap items-center gap-1">
        {([
          { id: 'all', label: '全部', count: recent.length },
          { id: 'running', label: '进行中', count: runningCount },
          { id: 'queued', label: '有待发送', count: queuedCount },
        ] as const).map(option => <button type="button" key={option.id} aria-pressed={scope === option.id}
          onClick={() => setScope(option.id)}
          className={cn('inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
            scope === option.id ? 'bg-[var(--color-muted)] font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]')}>
          {option.label}<span className="tabular-nums">{option.count}</span>
        </button>)}
      </div>
      {uncheckedCount > 0 && <p role="status" className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        {uncheckedCount} 个队列尚未核对{scope === 'queued' ? '，已保留在下方供检查' : ''}
      </p>}
      {sessionQuery.isError && <p role="alert" className="mt-2 text-xs text-[var(--color-destructive)]">
        会话名单更新失败{sessionQuery.data ? '，当前显示上次读取的名单' : '，请刷新重试'}。
      </p>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {sessionQuery.isPending ? <p role="status" className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">正在读取最近会话…</p>
        : entries.length > 0 ? <>
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_90px_minmax(0,1.2fr)_118px_84px] gap-4 border-b border-[var(--color-border)] px-6 py-2 text-xs text-[var(--color-muted-foreground)] @min-[760px]/session-board:grid">
            <span>会话 / 项目</span><span>状态</span><span>待发送任务</span><span>最近活动</span><span />
          </div>
          <ol className="divide-y divide-[var(--color-border)]">
            {entries.map(({ session, queue }) => <SessionBoardRow key={session.id} session={session} queue={queue}
              storage={storage.values.get(session.id)}
              current={session.id === currentSessionId} onOpen={() => onOpenSession(session.id, isBoardSessionRunning(session))} />)}
          </ol>
        </> : <div className="px-4 py-6 md:px-6">
          <p className="text-sm font-medium">{sessionQuery.isError ? '暂无法读取会话' : scope === 'running' ? '最近会话中没有正在运行的会话' : scope === 'queued' ? '最近会话中没有待发送任务' : '还没有可查看的开发会话'}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{sessionQuery.isError ? '连接恢复后可以重新读取。' : '此处仅展示最近 20 个未锁定的开发会话，其他历史可从会话列表查看。'}</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={sessionQuery.isError ? refresh : scope === 'all' ? onNewSession : () => setScope('all')} disabled={fetching}>
            {sessionQuery.isError ? '重试' : scope === 'all' ? '新建会话' : '查看全部最近会话'}
          </Button>
        </div>}
    </div>
  </section>
}

function SessionBoardRow({ session, queue, storage, current, onOpen }: {
  session: ClaudeChatSessionView
  queue: UseQueryResult<SessionBoardQueue, Error>
  storage?: { value?: SessionStorageView; failed: boolean }
  current: boolean
  onOpen: () => void
}) {
  const title = sessionDisplayName(session)
  const running = isBoardSessionRunning(session)
  const state = boardSessionState(session)
  const project = resolveSessionProject(session)
  return <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 hover:bg-[var(--color-muted)]/30 @min-[760px]/session-board:grid-cols-[minmax(0,1fr)_90px_minmax(0,1.2fr)_118px_84px] @min-[760px]/session-board:items-start @min-[760px]/session-board:gap-4 @min-[760px]/session-board:px-6">
    <div className="col-start-1 row-start-1 min-w-0">
      <button type="button" onClick={onOpen} className="flex min-h-9 w-full min-w-0 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label={`进入会话：${title}`}>
        <EngineIcon engine={session.engine ?? 'claude'} className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">{title}</span>
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
        <span title={session.cwd} className="max-w-full truncate">{project.label}</span>
        <span>{engineDisplayName(session.engine ?? 'claude', session.providerKind)}</span>
        <SessionImportBadge session={session} />
        <SessionStorageLabel {...storage} />
        {current && <span className="text-[var(--color-primary)]">当前会话</span>}
      </div>
    </div>
    <div className={cn('col-start-2 row-start-1 flex items-center gap-1.5 text-xs @min-[760px]/session-board:col-auto @min-[760px]/session-board:row-auto', running ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-foreground)]')}>
      <Circle aria-hidden="true" className={cn('size-2', running && 'fill-current')} />{state}
    </div>
    <div className="col-span-2 min-w-0 @min-[760px]/session-board:col-span-1">
      {queue.data ? <>
        <p className={cn('flex items-center gap-1.5 text-xs', queue.data.count > 0 ? 'font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]')}>
          {queue.data.count > 0 && <ListTodo aria-hidden="true" className="size-3.5" />}
          {queue.data.count > 0 ? `${queue.data.count} 条待发送${running ? ' · 等待本轮结束' : ' · 尚未执行'}` : '无待发送任务'}
        </p>
        {queue.data.tasks.length > 0 && <ol className="mt-2 space-y-1.5 text-xs leading-relaxed">
          {queue.data.tasks.map((task, index) => <li key={task.id} className="flex items-start gap-2">
            <span className="shrink-0 tabular-nums text-[var(--color-muted-foreground)]">{index + 1}</span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{task.preview}{task.attachmentCount > 0 && <span className="text-[var(--color-muted-foreground)]"> · {task.attachmentCount} 个附件</span>}</span>
          </li>)}
        </ol>}
        {queue.data.count > queue.data.tasks.length && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">另有 {queue.data.count - queue.data.tasks.length} 条，进入会话查看</p>}
      </> : <p role="status" className="text-xs text-[var(--color-muted-foreground)]">{queue.isError ? '队列暂无法获取' : '正在核对队列…'}</p>}
      {queue.isError && <button type="button" onClick={() => { void queue.refetch() }} disabled={queue.isFetching}
        className="mt-1 min-h-9 text-xs text-[var(--color-destructive)] underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50">
        {queue.data ? '队列更新失败，重试' : '重试队列读取'}
      </button>}
      {queue.dataUpdatedAt > 0 && <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">队列读取于 <time dateTime={new Date(queue.dataUpdatedAt).toISOString()}>{new Date(queue.dataUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false })}</time></p>}
    </div>
    <time dateTime={new Date(session.lastSeenAt).toISOString()} className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
      {new Date(session.lastSeenAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
    </time>
    <Button type="button" size="sm" variant="ghost" className="min-h-10 justify-end gap-1 px-0" onClick={onOpen} aria-label={`查看会话：${title}`}>
      查看会话<ArrowUpRight aria-hidden="true" className="size-3.5" />
    </Button>
  </li>
}
