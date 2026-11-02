import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { ListChecks, RefreshCw, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAccessContext } from '@/shell/permission'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { useRecentPlanningRuns } from '../hooks/useRecentPlanningRuns'
import { useWorkspaceDockPosition } from '../hooks/useWorkspaceDockPosition'
import { CHAT_ROUTE, useChatRuntime } from '../runtime/ChatRuntimeContext'

const QuickPanel = lazy(() => import('./SessionBoardQuickPanel').then(module => ({ default: module.SessionBoardQuickPanel })))

export function SessionBoardDock() {
  const access = useAccessContext()
  const { user } = useAuth()
  const { demo } = useChatRuntime()
  const allowed = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:claude-chat')
  return allowed && !demo ? <BoardDock key={user?.userId ?? 'local'} userId={user?.userId ?? 'local'} /> : null
}

function BoardDock({ userId }: { userId: number | string }) {
  const [open, setOpen] = useState(false)
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const [swipe, setSwipe] = useState(0)
  const swipeStart = useRef<{ id: number; y: number } | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const heading = useId(), description = useId(), panelId = useId()
  const navigate = useNavigate(), location = useLocation()
  const mobile = useMobileViewport()
  const placement = useWorkspaceDockPosition(userId)
  const query = useRecentPlanningRuns(open)
  const { chat, setFloating } = useChatRuntime()
  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useEffect(() => { setSwipe(0); swipeStart.current = null }, [open, mobile])
  const items = query.data?.items.slice(0, 8) ?? []
  const timestamp = Date.parse(query.data?.snapshotAt ?? '')
  const fresh = !query.isError && Number.isFinite(timestamp) && Date.now() - timestamp <= 45_000
  const pending = fresh ? items.filter(item => ['WAITING_USER', 'FAILED'].includes(item.run.state)).length : 0
  const running = fresh && items.some(item => item.run.state === 'ACTIVE')
  const failed = fresh && items.some(item => item.run.state === 'FAILED')
  const refresh = async () => {
    const result = await query.refetch()
    if (!result.isError) setRefreshEpoch(value => value + 1)
  }
  const go = (sessionId?: string, changeId?: string) => {
    setOpen(false); setFloating(false)
    if (sessionId && chat && chat.sessionId !== sessionId) chat.switchTo(sessionId)
    const params = new URLSearchParams({ view: sessionId ? 'autopilot_detail' : 'supervision' })
    if (sessionId && !chat) params.set('sessionId', sessionId)
    if (sessionId && changeId) params.set('changeId', changeId)
    navigate(`${CHAT_ROUTE}?${params}`)
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    placement.buttonRef.current?.focus({ preventScroll: true })
  }
  const trigger = <button ref={placement.buttonRef} type="button" aria-label="打开会话快捷看板"
    aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="dialog" tabIndex={open ? -1 : 0}
    title="会话工作台 · 拖动调整位置；Alt + 方向键移动"
    {...placement.pointerHandlers} onKeyDown={placement.onKeyDown}
    onClick={() => { if (placement.consumeDragClick()) return; setOpen(true) }}
    className={cn('fixed z-30 flex size-12 touch-none select-none items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)] shadow-sm hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]', open && 'pointer-events-none opacity-0')}
    style={placement.style}>
    <ListChecks aria-hidden="true" className="size-5" />
    {pending > 0 ? <span aria-label={`最近规划待处理 ${pending} 项`} className={cn('absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-5', failed ? 'bg-[var(--color-destructive)] text-white' : 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]')}>{pending}</span>
      : running ? <span aria-label="最近规划进行中" className="absolute right-0 top-0 size-2.5 rounded-full bg-[var(--color-primary)] ring-2 ring-[var(--color-background)]" />
        : !fresh && !query.isPending ? <span aria-label="规划状态待更新" className="absolute right-0 top-0 size-2.5 rounded-full bg-[var(--color-muted-foreground)] ring-2 ring-[var(--color-background)]" /> : null}
  </button>
  const body = <>
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
        <h2 id={heading} className="text-sm font-semibold">会话工作台</h2>
        <p id={description} className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{Number.isFinite(timestamp) ? `最近更新 ${new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '最近规划 · 状态读取中'}</p>
      </div>
      <div className="flex shrink-0">
        <Button variant="ghost" size="icon" className="size-11" disabled={query.isFetching} aria-label="刷新最近规划" onClick={() => { void refresh() }}><RefreshCw className={cn('size-4', query.isFetching && 'animate-spin motion-reduce:animate-none')} /></Button>
        <Button ref={closeRef} variant="ghost" size="icon" className="size-11" aria-label="关闭会话快捷看板" onClick={() => setOpen(false)}><X className="size-4" /></Button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ErrorBoundary label="session-quick-board" compact><Suspense fallback={<p role="status" className="px-4 py-6 text-sm">正在打开工作台…</p>}>
        <QuickPanel query={query} refreshEpoch={refreshEpoch} onRefresh={refresh} currentSessionId={chat?.sessionId ?? null} onOpenSession={go} />
      </Suspense></ErrorBoundary>
    </div>
    <footer className="shrink-0 border-t px-4 pb-[env(safe-area-inset-bottom)]"><button type="button" onClick={() => go()} className="min-h-11 text-xs text-[var(--color-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">打开完整规划看板</button></footer>
  </>
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
