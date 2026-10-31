import { useSyncExternalStore } from 'react'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'

const wideQuery = '(min-width: 984px)'
function subscribeWidth(listener: () => void) {
  const media = window.matchMedia?.(wideQuery)
  media?.addEventListener('change', listener)
  return () => media?.removeEventListener('change', listener)
}
const readWidth = () => Boolean(window.matchMedia?.(wideQuery).matches)

/** Reading controls only; execution remains owned by the workspace runtime. */
export function FocusReadingHeader({ title, status, running, wide, onToggleWidth, onOpenDetails, onExit }: {
  title: string; status: string; running: boolean; wide: boolean
  onToggleWidth: () => void; onOpenDetails: () => void; onExit: () => void
}) {
  const canWiden = useSyncExternalStore(subscribeWidth, readWidth, () => false)
  const portal = useFullscreenPortalContainer()
  return <header className="cc-focus-header shrink-0 border-b border-[var(--color-border)]">
    <div className="cc-focus-header-inner flex min-w-0 items-center gap-2">
      <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={onExit} aria-label="返回工作台" title="返回工作台（Esc）">
        <ArrowLeft className="size-5" aria-hidden="true" />
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</h1>
      <span role="status" aria-label={status} title={status} className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${running ? 'bg-emerald-500' : 'bg-current opacity-50'}`} />
        <span className="hidden sm:inline">{status}</span>
      </span>
      <Popover.Root>
        <Popover.Trigger asChild><Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="阅读与会话选项">
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </Button></Popover.Trigger>
        <Popover.Portal container={portal}><Popover.Content align="end" sideOffset={4} className="z-[80] w-48 max-w-[calc(100vw-2rem)] rounded-lg border bg-[var(--color-popover)] p-1 text-[var(--color-popover-foreground)] shadow-sm"
          onEscapeKeyDown={event => event.stopPropagation()}>
          {canWiden && <Button variant="ghost" className="min-h-11 w-full justify-start text-sm" aria-pressed={wide} onClick={onToggleWidth}>
            {wide ? '标准阅读宽度' : '宽版阅读'}
          </Button>}
          <Popover.Close asChild><Button variant="ghost" className="min-h-11 w-full justify-start text-sm" onClick={onOpenDetails}>运行详情</Button></Popover.Close>
        </Popover.Content></Popover.Portal>
      </Popover.Root>
    </div>
  </header>
}
