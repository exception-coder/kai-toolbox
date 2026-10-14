import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { ChevronDown, FolderTree } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMobileViewport } from '../hooks/useMobileViewport'

/** 标题只切换当前上下文；页面导航由更多菜单持有。 */
export function MobileWorkspaceSwitcher({ title, status, control, onOpen, onSwitchWorkspace, triggerRef }: {
  title: string
  status: string
  control?: (close: () => void) => ReactNode
  onOpen?: () => void
  onSwitchWorkspace: (trigger: HTMLButtonElement | null) => void
  triggerRef?: Ref<HTMLButtonElement>
}) {
  const [open, setOpen] = useState(false)
  const ownTriggerRef = useRef<HTMLButtonElement>(null)
  const attachTrigger = useCallback((node: HTMLButtonElement | null) => {
    ownTriggerRef.current = node
    if (typeof triggerRef === 'function') triggerRef(node)
    else if (triggerRef) triggerRef.current = node
  }, [triggerRef])
  const mobile = useMobileViewport()
  useEffect(() => { if (!mobile) setOpen(false) }, [mobile])
  const close = () => setOpen(false)
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) onOpen?.() }}>
    <PopoverTrigger asChild>
      <button ref={attachTrigger} type="button" aria-label={`切换工作空间与对话方式，${title}`} title={title}
        className="cc-mobile-session-navigation mx-auto flex min-h-11 min-w-0 max-w-full items-center justify-center gap-1 rounded-xl px-2 text-sm font-semibold hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        <span className="truncate">{title}</span>
        <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-[var(--color-muted-foreground)]" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="center" sideOffset={8} className="w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-80px)] overflow-y-auto rounded-2xl bg-[var(--color-background)] p-2 shadow-sm" aria-label="工作空间与对话方式">
      <div className="px-3 pb-3 pt-2">
        <p className="break-words text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{status}</p>
      </div>
      {control && <section aria-label="当前模式">
        <p className="px-3 pb-1 text-xs text-[var(--color-muted-foreground)]">当前模式</p>
        {control(close)}
      </section>}
      <div className="mt-2 border-t pt-1">
        <button type="button" onClick={() => { close(); onSwitchWorkspace(ownTriggerRef.current) }}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
          <FolderTree aria-hidden="true" className="size-4 text-[var(--color-muted-foreground)]" />切换工作空间
        </button>
      </div>
    </PopoverContent>
  </Popover>
}
