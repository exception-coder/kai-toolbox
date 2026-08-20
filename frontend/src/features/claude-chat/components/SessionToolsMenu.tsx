import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SessionToolsMenuProps {
  open: boolean
  mockMode?: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function SessionToolsMenu({ open, mockMode = false, onOpenChange, children }: SessionToolsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onOpenChange(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange, open])

  const label = mockMode ? '会话工具，MOCK 模式已开启' : '会话工具'

  return (
    <div className="relative flex h-full shrink-0 items-center border-l border-[var(--color-border)] bg-transparent px-1">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 gap-1 rounded-md px-2 text-[var(--color-muted-foreground)]',
          open && 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]',
        )}
        onClick={() => onOpenChange(!open)}
        aria-label={label}
        aria-controls="session-tools-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
      >
        <span className="hidden text-xs sm:inline">会话工具</span>
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => onOpenChange(false)} />
          <div
            id="session-tools-menu"
            role="menu"
            aria-label="会话工具"
            className="absolute right-0 top-full z-50 mt-1 max-h-[75vh] w-56 overflow-y-auto rounded-xl border bg-[var(--color-popover)] py-1 text-[var(--color-popover-foreground)] shadow-xl"
          >
            {mockMode && (
              <div className="mx-2 mb-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 md:hidden">
                MOCK 模式已开启
              </div>
            )}
            {children}
          </div>
        </>
      )}
    </div>
  )
}

export function SessionToolItem({ icon, label, hint, onClick, nested }: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
  nested?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 py-2 text-left hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]',
        nested ? 'pl-9 pr-3' : 'px-3',
      )}
    >
      <span className="shrink-0 text-[var(--color-muted-foreground)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">{hint}</span>}
      </span>
    </button>
  )
}

export function SessionToolSection({ icon, label, open, onToggle, children }: {
  icon: ReactNode
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        role="menuitem"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]"
      >
        <span className="shrink-0 text-[var(--color-muted-foreground)]">{icon}</span>
        <span className="flex-1 text-sm font-medium">{label}</span>
        <ChevronDown className={cn('size-4 text-[var(--color-muted-foreground)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}
