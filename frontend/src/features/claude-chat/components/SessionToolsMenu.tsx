import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ToolNavigation = createContext({ drilldown: false, hasSelection: false })

function visibleMenuEntries(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('button:not(:disabled), summary')]
    .filter(entry => typeof entry.checkVisibility === 'function' ? entry.checkVisibility()
      : !entry.closest('[hidden]') && (entry.tagName === 'SUMMARY' || !entry.closest('details:not([open])')))
}

interface SessionToolsMenuProps {
  open: boolean
  mockMode?: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  activeGroupLabel?: string
  onBack?: () => void
  manageFocus?: boolean
  triggerRef?: RefObject<HTMLButtonElement | null>
}

export function SessionToolsMenu({ open, mockMode = false, onOpenChange, children, activeGroupLabel, onBack, manageFocus = true, triggerRef: suppliedTriggerRef }: SessionToolsMenuProps) {
  const ownTriggerRef = useRef<HTMLButtonElement>(null)
  const triggerRef = suppliedTriggerRef ?? ownTriggerRef
  const menuRef = useRef<HTMLDivElement>(null)
  const previous = useRef<{ open: boolean; label?: string }>({ open: false })
  useEffect(() => {
    const prior = previous.current
    previous.current = { open, label: activeGroupLabel }
    if (!open || !onBack || !manageFocus) return
    const returnedLabel = prior.open && !activeGroupLabel ? prior.label : undefined
    const entries = menuRef.current ? visibleMenuEntries(menuRef.current) : []
    const category = returnedLabel && entries.find(entry => entry.getAttribute('data-tool-group-label') === returnedLabel)
    const target = category || entries[0]
    target?.focus()
  }, [open, activeGroupLabel, manageFocus])

  useEffect(() => {
    if (!open || !manageFocus) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (onBack && activeGroupLabel) onBack()
        else { onOpenChange(false); triggerRef.current?.focus() }
        return
      }
      if (!menuRef.current?.contains(document.activeElement) || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const entries = visibleMenuEntries(menuRef.current)
      if (!entries.length) return
      event.preventDefault()
      const index = entries.indexOf(document.activeElement as HTMLElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + entries.length) % entries.length
      entries[next].focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange, open, onBack, activeGroupLabel, manageFocus])

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
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => { onOpenChange(false); triggerRef.current?.focus() }} />
          <div
            ref={menuRef}
            id="session-tools-menu"
            role="menu"
            aria-label="会话工具"
            className="absolute right-0 top-full z-50 mt-1 max-h-[75dvh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border bg-[var(--color-popover)] py-1 text-[var(--color-popover-foreground)] shadow-sm"
          >
            {mockMode && (
              <div className="mx-2 mb-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 md:hidden">
                MOCK 模式已开启
              </div>
            )}
            {onBack && (activeGroupLabel
              ? <div className="sticky top-0 z-10 border-b bg-[var(--color-popover)]">
                  <button type="button" role="menuitem" aria-label="返回会话工具" onClick={onBack}
                    className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] hover:bg-[var(--color-muted)]">
                    <ChevronLeft className="size-4" aria-hidden="true" />{activeGroupLabel}
                  </button>
                </div>
              : <p className="px-3 pb-1 pt-2 text-xs text-[var(--color-muted-foreground)]">会话工具</p>)}
            <ToolNavigation.Provider value={{ drilldown: !!onBack, hasSelection: !!activeGroupLabel }}>{children}</ToolNavigation.Provider>
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

export function SessionToolSection({ icon, label, hint, disabled, open, onToggle, children }: {
  icon: ReactNode
  label: string
  hint?: string
  disabled?: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const navigation = useContext(ToolNavigation)
  if (navigation.drilldown && navigation.hasSelection) return open
    ? <div className="py-1">{disabled ? <p role="status" className="px-3 py-3 text-sm text-[var(--color-muted-foreground)]">先新建或选择会话，再使用此类工具。</p> : children}</div>
    : null
  return (
    <div>
      <button
        type="button"
        role="menuitem"
        aria-label={label}
        aria-description={disabled ? '先新建或选择会话' : hint}
        data-tool-group-label={label}
        disabled={disabled}
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50 text-left hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]"
      >
        <span className="shrink-0 text-[var(--color-muted-foreground)]">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          {hint && <span className="mt-0.5 block text-[11px] font-normal text-[var(--color-muted-foreground)]">{disabled ? '先新建或选择会话' : hint}</span>}
        </span>
        {navigation.drilldown ? <ChevronRight className="size-4 text-[var(--color-muted-foreground)]" aria-hidden="true" /> : <ChevronDown className={cn('size-4 text-[var(--color-muted-foreground)] transition-transform', open && 'rotate-180')} />}
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}
