import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  Loader2, Square,
  BarChart3, ChevronDown, Maximize2, Minimize2, Route,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { getSessionRuntimeState, listSessions, type SessionUsage } from '../api'
import type { BackgroundTaskInfo, ChatItem, ClaudeChatSessionView, ConnState, SessionRuntimeState } from '../types'
import { abbr, fmtMs, formatTime, parseUsage } from '../lib/metrics'
import { cn } from '@/lib/utils'
import { sessionWorkspaceLabel } from '../lib/sessionProjectGroups'
import { useMobileDisclosure } from '../hooks/useMobileDisclosure'
import { boardSessionState, isBoardSessionRunning, recentBoardSessions } from '../lib/sessionBoard'
import { sessionDisplayName } from '../lib/sessionDisplayName'
import { currentActivityElapsed, hasExecutionNotice } from '../lib/mobileExecutionPresentation'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { useControlSheetViewport } from '../hooks/useControlSheetViewport'

export type MobileSessionStatusModel = {
  kind: 'running' | 'background' | 'warning' | 'completed' | 'usage'
  label: string
  detail?: string
}

const CONTROL_HINT_KEY = 'forge:session-control-entry-discovered'
function controlEntryDiscovered() {
  try { return localStorage.getItem(CONTROL_HINT_KEY) === '1' } catch { return true }
}

interface Props {
  onInterrupt?: () => void
  interrupting?: boolean
  workspace?: boolean
  sessionId: string
  items: ChatItem[]
  running: boolean
  engineLabel: string
  turnTokens: number
  connState: ConnState
  backgroundTasks: BackgroundTaskInfo[]
  usage: SessionUsage | null
  usageLoading: boolean
  onOpenUsage: () => void
  onOpenTrajectory: () => void
  onOpenSupervision?: () => void
  onSwitchSession?: (sessionId: string, hintRunning?: boolean) => void
  onOpenSessionList?: () => void
  queueCount?: number
  queuePausedReason?: string | null
  queueContent?: ReactNode
  actions?: ReactNode | ((close: () => void) => ReactNode)
  storage?: ReactNode
  actionHint?: ReactNode
  children?: ReactNode | ((close: () => void, executing: boolean) => ReactNode)
}

export function MobileSessionStatus({
  workspace = false, onInterrupt, interrupting = false,
  sessionId,
  items,
  running,
  engineLabel,
  turnTokens,
  connState,
  backgroundTasks,
  usage,
  usageLoading,
  onOpenUsage,
  onOpenTrajectory,
  onSwitchSession,
  onOpenSessionList,
  queueCount = 0,
  queuePausedReason,
  queueContent,
  actions,
  storage,
  actionHint,
  children,
}: Props) {
  const [open, setOpen] = useMobileDisclosure(!workspace)
  const mobile = useMobileViewport()
  const viewport = useControlSheetViewport(open)
  const controlId = useId()
  const hintId = useId()
  const [discovered, setDiscovered] = useState(controlEntryDiscovered)
  useEffect(() => {
    if (!mobile || discovered) return
    const remember = () => {
      setDiscovered(true)
      try { localStorage.setItem(CONTROL_HINT_KEY, '1') } catch { /* 引导存储不可用不影响会话操作。 */ }
    }
    if (open) { remember(); return }
    const timer = window.setTimeout(remember, 6_000)
    return () => window.clearTimeout(timer)
  }, [mobile, open, discovered])
  const [view, setView] = useState<'actions' | 'recent'>('actions')
  const [expanded, setExpanded] = useState(false), [detailsOpen, setDetailsOpen] = useState(false)
  const drag = useRef<{ id: number; y: number } | null>(null)
  const [dragY, setDragY] = useState(0)
  useEffect(() => {
    if (open) return
    setView('actions'); setExpanded(false); setDetailsOpen(false); setDragY(0); drag.current = null
  }, [open, sessionId])
  const trigger = useRef<HTMLButtonElement>(null)
  const runtime = useQuery({
    queryKey: ['claude-chat-runtime-state', sessionId],
    queryFn: () => getSessionRuntimeState(sessionId),
    refetchInterval: running ? 5_000 : 15_000,
    retry: 1,
  })
  const sessionList = useQuery({
    queryKey: ['claude-chat-sessions'],
    queryFn: listSessions,
    enabled: open && view === 'recent' && Boolean(onSwitchSession),
    refetchInterval: open && view === 'recent' ? 15_000 : false,
  })
  const recentSessions = recentBoardSessions(sessionList.data ?? [])
  const status = deriveMobileSessionStatus({
    items,
    running,
    engineLabel,
    turnTokens,
    connState,
    backgroundTasks,
    runtimeState: runtime.data,
    runtimePending: runtime.isPending,
    runtimeError: runtime.isError,
    usage,
    usageLoading,
  })

  const label = status?.label ?? (runtime.isPending ? '正在核对会话状态…' : `${engineLabel} · 空闲`)
  const currentActivity = running ? findCurrentActivity(items) : null
  const elapsed = running ? currentActivityElapsed(items) : null
  const summaryLabel = workspace && status?.kind === 'completed'
    ? mobile ? '本轮完成' : 'Agent 状态'
    : workspace && status?.kind === 'usage' ? 'Agent 状态' : label
  const completedTime = workspace && mobile && status?.kind === 'completed' ? formatTime(findLatestResult(items)?.ts) : null
  const summary = [summaryLabel, currentActivity, workspace && elapsed != null ? fmtMs(elapsed) : null, completedTime].filter(Boolean).join(' · ')
  const warning = status?.kind === 'warning' || Boolean(queuePausedReason)
  const active = status?.kind === 'running' || status?.kind === 'background'
  const executionNotice = workspace && mobile && hasExecutionNotice(items, active)
  const Icon = warning ? AlertTriangle : active ? Loader2 : status?.kind === 'completed' ? CheckCircle2 : Activity

  return (
    <div className={cn('relative', workspace ? 'cc-workspace-execution-dock' : 'md:hidden')} data-execution-state={status?.kind ?? 'idle'} data-has-queue={queueCount > 0}>
      {mobile && !open && !discovered && <span id={hintId} className="pointer-events-none absolute right-3 bottom-full z-10 mb-1 max-w-[calc(100%-1.5rem)] rounded-md border bg-[var(--color-background)] px-3 py-2 text-xs text-[var(--color-foreground)] shadow-sm">点击此栏管理队列与会话</span>}
      <div className="flex min-w-0 items-center">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(value => !value)}
        className={cn(
          'flex h-11 w-full min-w-0 flex-1 items-center gap-2 border-b px-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]',
          workspace && 'md:h-9',
          warning
            ? 'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
            : 'border-[var(--color-border)]/70 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
        )}
        aria-label={`${open ? '关闭' : '打开'}会话控制，${summary}${executionNotice ? '，本轮有执行提示' : ''}${queueCount ? `，队列 ${queueCount} 条${queuePausedReason ? '已暂停' : ''}` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? controlId : undefined}
        aria-describedby={mobile && !open && !discovered ? hintId : undefined}
      >
        <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', active && !warning && 'animate-spin text-[var(--color-primary)] motion-reduce:animate-none', !warning && status?.kind === 'completed' && 'text-emerald-600 dark:text-emerald-400')} />
        <span className="min-w-0 flex-1 truncate font-medium" title={summary}>{summary}</span>
        {executionNotice && <span className="sr-only md:not-sr-only md:shrink-0">执行提示</span>}
        {queueCount > 0 && <span className="shrink-0 whitespace-nowrap tabular-nums">队列 {queueCount}{queuePausedReason ? ' · 已暂停' : ''}</span>}
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-[var(--color-primary)]">会话控制{open ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronUp aria-hidden="true" className="size-3.5" />}</span>
      </button>
      {mobile && running && onInterrupt && <button type="button" aria-label={interrupting ? '正在停止任务' : '停止任务'}
        disabled={interrupting} onClick={onInterrupt}
        className="flex h-11 shrink-0 items-center gap-1 border-b px-3 text-xs text-[var(--color-foreground)] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        {interrupting ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Square className="size-3.5" aria-hidden="true" />}停止
      </button>}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent id={controlId} side="bottom" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }) }}
          style={{ ...(mobile ? { bottom: viewport.bottom, maxHeight: Math.max(0, viewport.height * (expanded ? 0.9 : 0.6)) } : {}), ...(dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : {}) }}
          className={cn('flex max-h-[80dvh] flex-col gap-0 overflow-hidden rounded-t-xl p-0 pb-[env(safe-area-inset-bottom)] [&_button]:min-h-11 [&>button]:min-w-11', workspace ? 'md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[min(42rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-xl md:border' : 'md:hidden')}>
          {mobile && <div data-session-control-handle className="flex h-7 shrink-0 touch-none items-center justify-center" aria-hidden="true"
            onPointerDown={event => { if (event.button !== 0 || event.isPrimary === false || drag.current) return; drag.current = { id: event.pointerId, y: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId) }}
            onPointerMove={event => { if (drag.current && drag.current.id === event.pointerId) setDragY(Math.max(0, event.clientY - drag.current.y)) }}
            onPointerUp={event => { if (!drag.current || drag.current.id !== event.pointerId) return; const delta = event.clientY - drag.current.y; drag.current = null; setDragY(0); if (delta > 64) setOpen(false); else if (delta < -48) setExpanded(true) }}
            onLostPointerCapture={event => { if (event.target === event.currentTarget && drag.current?.id === event.pointerId) { drag.current = null; setDragY(0) } }}
            onPointerCancel={() => { drag.current = null; setDragY(0) }}><span className="h-1 w-9 rounded-full bg-[var(--color-muted-foreground)]/40" /></div>}
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2 pr-14">
            <SheetTitle>会话控制</SheetTitle>
            <SheetDescription className="sr-only">当前会话的队列与快捷操作</SheetDescription>
            {mobile && <button type="button" aria-label={expanded ? '收起控制面板' : '展开控制面板'} className="flex min-w-11 items-center justify-center text-[var(--color-muted-foreground)]" onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>}
          </div>
          {onSwitchSession && <div role="group" aria-label="会话控制视图" className="mx-4 mb-2 grid shrink-0 grid-cols-2 rounded-md bg-[var(--color-muted)] p-0.5 text-sm">
            <button type="button" aria-pressed={view === 'actions'} className={cn('rounded px-2', view === 'actions' && 'bg-[var(--color-background)] font-medium')} onClick={() => setView('actions')}>快捷操作</button>
            <button type="button" aria-pressed={view === 'recent'} className={cn('rounded px-2', view === 'recent' && 'bg-[var(--color-background)] font-medium')} onClick={() => setView('recent')}>最近会话</button>
          </div>}
          <div className="min-h-0 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-3 text-sm" role="region" aria-label="会话操作与运行详情" tabIndex={0}>
            {view === 'actions' ? <>
            {queueContent}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-1 py-1">
            {typeof actions === 'function' ? actions(() => setOpen(false)) : actions}
              <Button variant="ghost" className="h-16 flex-col gap-1 text-xs" onClick={() => { setOpen(false); onOpenTrajectory() }}><Route aria-hidden="true" className="size-4" />执行轨迹</Button>
              <Button variant="ghost" className="h-16 flex-col gap-1 text-xs" onClick={() => { setOpen(false); onOpenUsage() }}><BarChart3 aria-hidden="true" className="size-4" />会话用量</Button>
            </div>
            {actionHint && <p className="text-xs text-[var(--color-muted-foreground)]">{actionHint}</p>}
            {storage && <section aria-label="会话记录">{storage}</section>}
            <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)} className="flex w-full items-center justify-between text-xs text-[var(--color-muted-foreground)]">运行详情<ChevronDown aria-hidden="true" className={cn('size-4', detailsOpen && 'rotate-180')} /></button>
            {detailsOpen && <>
            <section aria-label="运行概览" className="border-t pt-3">
              <DetailRow label="当前状态" value={label} />
              {status?.detail && <DetailRow label="说明" value={status.detail} />}
              {running && <DetailRow label="当前执行" value={currentActivity ?? '正在生成回复…'} />}
              {queuePausedReason && (!queueContent || queueCount === 0) && <p role="status" className="text-amber-700 dark:text-amber-300">{queuePausedReason}</p>}
              {runtime.data && <><DetailRow label="全链路" value={`${runtimeStatusLabel(runtime.data.effectiveStatus)} · ${runtime.data.consistency}`} /><DetailRow label="建议" value={runtime.data.recommendedAction} /></>}
              {usage && usage.turns > 0 && <DetailRow label="会话累计" value={`${usage.turns} 轮 · ${abbr(usage.totalTokens)} Token`} />}
            </section>
            {typeof children === 'function' ? children(() => setOpen(false), active) : children}
            </>}
            </> : onSwitchSession && <section aria-label="快速切换会话">
              {sessionList.isPending && <p className="text-xs text-[var(--color-muted-foreground)]">正在加载会话…</p>}
              {sessionList.isError && <p role="alert" className="text-xs text-[var(--color-destructive)]">会话列表加载失败。<button type="button" className="underline" onClick={() => sessionList.refetch()}>重试</button></p>}
              {!sessionList.isPending && !sessionList.isError && recentSessions.length === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">暂无可切换的会话</p>}
              {recentSessions.length > 0 && <SessionShortcuts title="最近会话" sessions={recentSessions} currentId={sessionId} onSelect={session => { setOpen(false); onSwitchSession(session.id, isBoardSessionRunning(session)) }} />}
              {onOpenSessionList && <Button variant="ghost" className="w-full text-xs" onClick={() => { setOpen(false); onOpenSessionList() }}>查看完整会话列表</Button>}
            </section>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function SessionShortcuts({ title, sessions, currentId, onSelect }: {
  title: string
  sessions: ClaudeChatSessionView[]
  currentId: string
  onSelect: (session: ClaudeChatSessionView) => void
}) {
  return <div className="mb-3">
    <p className="mb-1 text-xs text-[var(--color-muted-foreground)]">{title} · {sessions.length}</p>
    <ul className="divide-y divide-[var(--color-border)]/70">
      {sessions.map(session => <li key={session.id}>
        <button type="button" onClick={() => onSelect(session)} aria-current={session.id === currentId ? 'page' : undefined}
          className="flex min-h-11 w-full items-center gap-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]">
          <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{boardSessionState(session)}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{sessionDisplayName(session)}</span>
          {session.id === currentId && <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">当前</span>}
          <span className="max-w-24 shrink-0 truncate text-xs text-[var(--color-muted-foreground)]" title={session.cwd}>{sessionWorkspaceLabel(session.cwd)}</span>
        </button>
      </li>)}
    </ul>
  </div>
}

function findCurrentActivity(items: ChatItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (item.kind === 'result' || item.kind === 'user') break
    if (item.kind === 'activity' && ['inProgress', 'in_progress', 'running', 'pending', 'started'].includes(item.status)) return item.title
  }
  return null
}

export function deriveMobileSessionStatus({
  items,
  running,
  engineLabel,
  connState,
  backgroundTasks,
  runtimeState,
  runtimePending,
  runtimeError,
  usage,
  usageLoading,
}: {
  items: ChatItem[]
  running: boolean
  engineLabel: string
  turnTokens: number
  connState: ConnState
  backgroundTasks: BackgroundTaskInfo[]
  runtimeState?: SessionRuntimeState
  runtimePending: boolean
  runtimeError: boolean
  usage: SessionUsage | null
  usageLoading: boolean
}): MobileSessionStatusModel | null {
  if (running) {
    const reconnecting = connState === 'connecting' || connState === 'closed' || connState === 'error'
    return {
      kind: 'running',
      label: reconnecting
        ? '正在重连会话…'
        : `${engineLabel} 正在运行`,
      detail: reconnecting ? 'Agent 可能仍在后台执行，连接恢复前不会误判为空闲。' : undefined,
    }
  }

  if (backgroundTasks.length > 0) {
    const first = backgroundTasks[0]
    return {
      kind: 'background',
      label: `后台任务进行中 · ${backgroundTasks.length}`,
      detail: first?.description || first?.taskType,
    }
  }

  if (runtimeError) {
    return {
      kind: 'warning',
      label: '全链路状态暂不可用',
      detail: '发送前仍会由后端再次核对会话状态。',
    }
  }

  if (runtimeState && runtimeState.consistency !== 'CONSISTENT') {
    return {
      kind: 'warning',
      label: `状态待校正 · ${runtimeStatusLabel(runtimeState.effectiveStatus)}`,
      detail: runtimeState.reason,
    }
  }

  if (runtimeState) {
    if (runtimeState.pendingDecision) {
      return {
        kind: 'warning',
        label: '等待你的确认',
        detail: runtimeState.reason,
      }
    }
    if ((runtimeState.backgroundTaskCount ?? 0) > 0) {
      return {
        kind: 'background',
        label: `后台任务进行中 · ${runtimeState.backgroundTaskCount}`,
        detail: runtimeState.reason,
      }
    }
    switch (runtimeState.effectiveStatus) {
      case 'RUNNING':
        return {
          kind: 'running',
          label: `${engineLabel} 正在运行`,
          detail: runtimeState.phase || runtimeState.reason,
        }
      case 'AWAITING_DECISION':
        return {
          kind: 'warning',
          label: '等待你的确认',
          detail: runtimeState.reason,
        }
      case 'FINALIZING':
        return {
          kind: 'running',
          label: '正在收口本轮结果…',
          detail: runtimeState.reason,
        }
      case 'BACKGROUND_RUNNING':
        return {
          kind: 'background',
          label: `后台任务进行中${runtimeState.backgroundTaskCount ? ` · ${runtimeState.backgroundTaskCount}` : ''}`,
          detail: runtimeState.reason,
        }
      case 'RECONNECTING':
        return {
          kind: 'running',
          label: '正在重连会话…',
          detail: runtimeState.reason,
        }
      case 'INTERRUPTED':
        return {
          kind: 'warning',
          label: '本轮已中断',
          detail: runtimeState.reason,
        }
      case 'UNKNOWN':
        return {
          kind: 'warning',
          label: '会话状态待确认',
          detail: runtimeState.reason,
        }
      default:
        break
    }
  }

  // 只有全链路已明确回到 IDLE，才能把最近 result 当成当前唯一终态。
  // 首次查询期间宁可暂不显示，也不能闪现“已完成”后再跳回运行中。
  if (runtimePending || !runtimeState || runtimeState.effectiveStatus !== 'IDLE') return null

  const result = findLatestResult(items)
  if (result) {
    const reason = result.stopReason.trim().toLowerCase()
    const completed = ['end_turn', 'success', 'completed', 'stop'].includes(reason)
    const duration = result.latencyMs && result.latencyMs > 0 ? formatDuration(result.latencyMs) : null
    const outputTokens = parseUsage(result.usage)?.output
    const metrics = [duration, typeof outputTokens === 'number' && outputTokens > 0 ? `${abbr(outputTokens)} Token` : null]
      .filter(Boolean)
      .join(' · ')
    return completed
      ? { kind: 'completed', label: '空闲 · 最近一轮完成', detail: metrics || undefined }
      : {
          kind: 'warning',
          label: reason === 'interrupted' ? '本轮已中断' : '本轮异常结束',
          detail: '待发送队列不会自动继续。',
        }
  }

  if (usageLoading) return null
  if (usage && usage.turns > 0) {
    return {
      kind: 'usage',
      label: `${engineLabel} · 空闲`,
      detail: `会话累计 · ${usage.turns} 轮 · ${abbr(usage.totalTokens)} Token`,
    }
  }
  return null
}

function findLatestResult(items: ChatItem[]): Extract<ChatItem, { kind: 'result' }> | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'result') return item
    if (item.kind === 'user') return null
  }
  return null
}

function runtimeStatusLabel(status: SessionRuntimeState['effectiveStatus']): string {
  switch (status) {
    case 'RUNNING': return '运行中'
    case 'AWAITING_DECISION': return '等待确认'
    case 'FINALIZING': return '正在收口'
    case 'BACKGROUND_RUNNING': return '后台作业中'
    case 'RECONNECTING': return '正在重连'
    case 'INTERRUPTED': return '已中断'
    case 'IDLE': return '空闲'
    default: return '状态待确认'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  const seconds = Math.round(ms / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}m${rest}s` : `${minutes}m`
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-border)]/60 pb-2 last:border-0">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  )
}
