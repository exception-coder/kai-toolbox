import { lazy, Suspense, useEffect, useId, useState } from 'react'
import { ListChecks, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAccessContext } from '@/shell/permission'
import { useAuth } from '@/lib/auth'
import { CHAT_ROUTE, useChatRuntime } from '../runtime/ChatRuntimeContext'

const QuickPanel = lazy(() => import('./SessionBoardQuickPanel').then(module => ({ default: module.SessionBoardQuickPanel })))

/** A read-only edge entry; opening it does not activate the chat engine or download the full board. */
export function SessionBoardDock() {
  const access = useAccessContext()
  const { user } = useAuth()
  const { demo } = useChatRuntime()
  const allowed = access.superAdmin || access.roles.includes('ADMIN') || access.permissionCodes.includes('menu:claude-chat')
  return allowed && !demo ? <BoardDock key={user?.userId ?? 'local'} /> : null
}

function BoardDock() {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(() => window.innerHeight * 0.38)
  const heading = useId(), description = useId()
  const navigate = useNavigate()
  const location = useLocation()
  const { chat, setFloating } = useChatRuntime()
  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    const viewport = window.visualViewport
    const sync = () => setTop((viewport?.offsetTop ?? 0) + Math.max(12, Math.min(
      (viewport?.height ?? window.innerHeight) * 0.38, (viewport?.height ?? window.innerHeight) - 60)))
    sync()
    window.addEventListener('resize', sync)
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)
    return () => {
      window.removeEventListener('resize', sync)
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
    }
  }, [])
  const go = (sessionId?: string) => {
    setOpen(false)
    setFloating(false)
    // One switch owner: use the live runtime when present, otherwise let the deep-link owner restore it.
    if (sessionId && chat && chat.sessionId !== sessionId) chat.switchTo(sessionId)
    const params = new URLSearchParams(sessionId
      ? chat ? { view: 'conversation' } : { sessionId, view: 'conversation' }
      : { view: 'supervision' })
    navigate(`${CHAT_ROUTE}?${params}`)
  }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label="打开会话快捷看板" title="会话看板 · 最近规划"
        className="fixed z-30 flex h-12 w-11 items-center justify-center rounded-r-lg border border-l-0 border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)] hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]"
        style={{ top, left: 'env(safe-area-inset-left, 0px)' }}>
        <ListChecks aria-hidden="true" className="size-5" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="right" align="center" sideOffset={8} collisionPadding={12}
      aria-labelledby={heading} aria-describedby={description}
      className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b pl-4 pr-1">
        <div className="min-w-0 py-2">
          <h2 id={heading} className="text-sm font-semibold">会话看板</h2>
          <p id={description} className="text-xs text-[var(--color-muted-foreground)]">最近规划 · 点击返回原会话</p>
        </div>
        <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="关闭会话快捷看板" onClick={() => setOpen(false)}><X className="size-4" /></Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ErrorBoundary label="session-quick-board" compact>
          <Suspense fallback={<p role="status" className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">正在打开看板…</p>}>
            <QuickPanel currentSessionId={chat?.sessionId ?? null} onOpenSession={go} />
          </Suspense>
        </ErrorBoundary>
      </div>
      <footer className="shrink-0 border-t px-4">
        <button type="button" onClick={() => go()} className="min-h-11 text-xs text-[var(--color-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">打开完整规划看板</button>
      </footer>
    </PopoverContent>
  </Popover>
}
