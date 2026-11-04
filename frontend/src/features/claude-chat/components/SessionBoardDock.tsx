import { useWorkspaceQuickTools } from '../runtime/WorkspaceQuickTools'
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { Grid2X2, NotebookPen, ListChecks, RefreshCw, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAccessContext } from '@/shell/permission'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { useSessionBoardData } from '../hooks/useSessionBoardData'
import { useWorkspaceDockPosition } from '../hooks/useWorkspaceDockPosition'
import { CHAT_ROUTE, useChatRuntime } from '../runtime/ChatRuntimeContext'
import { isChatRoute } from '../runtime/ChatRuntimeContext'
import { useAssistantDock } from '@/features/work-assistants/public-api'

const BoardContent = lazy(() => import('./SessionBoard').then(module => ({ default: module.SessionBoardContent })))

export function SessionBoardDock() {
  const access = useAccessContext()
  const { user } = useAuth()
  const { demo } = useChatRuntime()
  const allowed = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:claude-chat')
  const tools = useWorkspaceQuickTools()
  const setAvailable = tools?.setAvailable
  useEffect(() => {
    setAvailable?.(allowed && !demo)
    return () => setAvailable?.(false)
  }, [allowed, demo, setAvailable])
  return allowed && !demo ? <BoardDock key={user?.userId ?? 'local'} userId={user?.userId ?? 'local'} /> : null
}

function BoardDock({ userId }: { userId: number | string }) {
  const [open, setOpen] = useState(false)
  const tools = useWorkspaceQuickTools()
  const [view, setView] = useState<'tools' | 'board'>('tools')
  const [swipe, setSwipe] = useState(0)
  const swipeStart = useRef<{ id: number; y: number } | null>(null)
  const handingOff = useRef(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }) }, [view, open])
  const heading = useId(), description = useId(), panelId = useId()
  const navigate = useNavigate(), location = useLocation()
  const mobile = useMobileViewport()
  const assistant = useAssistantDock()
  const delegate = assistant?.setDelegated
  const inChat = isChatRoute(location.pathname)
  useEffect(() => {
    if (!mobile || !inChat || !delegate) return
    delegate(true)
    return () => delegate(false)
  }, [delegate, mobile, inChat])
  const placement = useWorkspaceDockPosition(userId)
  const board = useSessionBoardData(open)
  const { chat, setFloating } = useChatRuntime()
  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useEffect(() => { setSwipe(0); swipeStart.current = null }, [open, mobile])
  const { sessionQuery } = board
  const timestamp = sessionQuery.dataUpdatedAt
  const fresh = !sessionQuery.isError && timestamp > 0 && Date.now() - timestamp <= 45_000
  const pending = fresh ? board.recent.filter((session, index) => session.status === 'INTERRUPTED'
    || (session.status === 'RUNNING' && !session.live)
    || (!board.queues[index].isError && Date.now() - board.queues[index].dataUpdatedAt <= 45_000 && (board.queues[index].data?.count ?? 0) > 0)).length : 0
  const running = fresh && board.runningCount > 0
  const failed = fresh && board.recent.some(session => session.status === 'INTERRUPTED')
  const go = (sessionId?: string, hintRunning = false) => {
    setOpen(false); setFloating(false)
    if (sessionId && chat && chat.sessionId !== sessionId) chat.switchTo(sessionId, hintRunning)
    const params = new URLSearchParams({ view: sessionId ? 'conversation' : 'board' })
    if (sessionId && !chat) params.set('sessionId', sessionId)
    navigate(`${CHAT_ROUTE}?${params}`)
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    if (handingOff.current) { handingOff.current = false; return }
    placement.buttonRef.current?.focus({ preventScroll: true })
  }
  const trigger = <button ref={element => { placement.buttonRef.current = element; if (tools) tools.trigger.current = element }} type="button" aria-label={tools ? "打开快捷工具" : "打开会话快捷看板"}
    aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="dialog" tabIndex={open ? -1 : 0}
    title="快捷工具 · 拖动调整位置；Alt + 方向键移动"
    {...placement.pointerHandlers} onKeyDown={placement.onKeyDown}
    onContextMenu={event => event.preventDefault()}
    onClick={() => { if (placement.consumeDragClick()) return; setView(tools ? 'tools' : 'board'); setOpen(true) }}
    className={cn('fixed z-30 flex h-11 w-11 touch-none select-none items-center justify-center border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)] hover:bg-[var(--color-accent)] active:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]', 'rounded-full shadow-sm', open && 'pointer-events-none opacity-0')}
    style={placement.style}>
    <Grid2X2 aria-hidden="true" className="pointer-events-none size-4" />
    {pending > 0 ? <span aria-label={`待关注会话 ${pending} 个`} className={cn('absolute -top-1 flex min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] leading-4', placement.edge === 'right' ? '-left-1' : '-right-1', failed ? 'bg-[var(--color-destructive)] text-white' : 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]')}>{pending}</span>
      : running ? <span aria-label="最近会话进行中" className="absolute right-0 top-0 size-2.5 rounded-full bg-[var(--color-primary)] ring-2 ring-[var(--color-background)]" />
        : !fresh && !sessionQuery.isPending ? <span aria-label="会话状态待更新" className="absolute right-0 top-0 size-2.5 rounded-full bg-[var(--color-muted-foreground)] ring-2 ring-[var(--color-background)]" /> : null}
  </button>
  const boardBody = <>
    {mobile && <div className="flex h-8 shrink-0 touch-none items-center justify-center" aria-hidden="true"
      onPointerDown={event => {
        if (event.button !== 0) return
        swipeStart.current = { id: event.pointerId, y: event.clientY }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }} onPointerMove={event => { if (swipeStart.current?.id === event.pointerId) setSwipe(Math.max(0, event.clientY - swipeStart.current.y)) }}
      onPointerUp={event => {
        if (swipeStart.current?.id !== event.pointerId) return
        if (event.clientY - swipeStart.current.y >= 64) setOpen(false)
        swipeStart.current = null; setSwipe(0)
      }} onPointerCancel={() => { swipeStart.current = null; setSwipe(0) }}>
      <span className="h-1 w-10 rounded-full bg-[var(--color-muted-foreground)]/50" />
    </div>}
    <header className="flex shrink-0 items-center justify-between gap-2 border-b py-2 pl-4 pr-1">
      <div className="min-w-0">
        <h2 id={heading} className="text-sm font-semibold">会话看板</h2>
        <p id={description} className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">最近 20 个会话 · {timestamp > 0 ? `更新于 ${new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '状态读取中'}</p>
      </div>
      <div className="flex shrink-0">
        <Button variant="ghost" size="icon" className="size-11" disabled={board.fetching} aria-label="刷新会话看板" onClick={board.refresh}><RefreshCw className={cn('size-4', board.fetching && 'animate-spin motion-reduce:animate-none')} /></Button>
        <Button ref={closeRef} variant="ghost" size="icon" className="size-11" aria-label="关闭会话快捷看板" onClick={() => setOpen(false)}><X className="size-4" /></Button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ErrorBoundary label="session-quick-board" compact><Suspense fallback={<p role="status" className="px-4 py-6 text-sm">正在打开工作台…</p>}>
        <BoardContent board={board} compact currentSessionId={chat?.sessionId ?? null} onOpenSession={go} onNewSession={() => go()} />
      </Suspense></ErrorBoundary>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 border-t px-4 pb-[env(safe-area-inset-bottom)]"><button type="button" onClick={() => go()} className="min-h-11 text-xs text-[var(--color-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">打开完整会话看板</button>
      {assistant && <button type="button" className="min-h-11 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]" onClick={() => { setOpen(false); assistant.launch(placement.buttonRef.current) }}>工作助理</button>}
    </footer>
  </>
  const body = view === 'board' ? boardBody : <section className="p-3">
    <h2 id={heading} className="px-2 text-sm font-semibold">快捷工具</h2>
    <p id={description} className="sr-only">查看会话看板或当前会话开发待办</p>
    <Button ref={closeRef} variant="ghost" className="mt-2 min-h-11 w-full justify-start gap-2" onClick={() => setView('board')}><ListChecks className="size-4" />会话看板</Button>
    {tools?.todo && <Button variant="ghost" className="min-h-11 w-full justify-start gap-2" onClick={() => { handingOff.current = true; setOpen(false); tools.todo?.open() }}><NotebookPen className="size-4" />开发待办</Button>}
    <Button variant="ghost" className="min-h-11 w-full" onClick={() => setOpen(false)}>关闭快捷工具</Button>
  </section>
  return mobile ? <Sheet open={open} onOpenChange={setOpen}>
    {trigger}
    <SheetContent id={panelId} side="bottom" hideCloseButton aria-modal="true" aria-labelledby={heading} aria-describedby={description}
      onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus({ preventScroll: true }) }} onCloseAutoFocus={restoreFocus}
      className="mx-3 flex max-h-[70dvh] flex-col overflow-hidden rounded-t-xl border p-0 shadow-sm motion-reduce:transition-none"
      style={{ bottom: placement.bottomInset, maxHeight: Math.min(placement.visibleHeight * 0.7, window.innerHeight * 0.7),
        ...(swipe ? { transform: `translateY(${swipe}px)`, transition: 'none' } : {}) }}>{body}</SheetContent>
  </Sheet> : <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild>{trigger}</PopoverAnchor>
    <PopoverContent id={panelId} side={placement.edge === 'right' ? 'left' : 'right'} align="center" sideOffset={8} collisionPadding={12}
      aria-labelledby={heading} aria-describedby={description} onCloseAutoFocus={restoreFocus}
      onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus({ preventScroll: true }) }}
      className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden shadow-sm">{body}</PopoverContent>
  </Popover>
}
