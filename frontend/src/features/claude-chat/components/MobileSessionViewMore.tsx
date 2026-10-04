import { useState } from 'react'
import { Check, ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SecondarySessionView = 'trajectory' | 'documents' | 'database' | 'sites' | 'usage' | 'review'

export interface SecondarySessionViewOption {
  id: SecondarySessionView
  label: string
  icon: LucideIcon
  attention?: boolean
}

/** 窄屏会话次级视图入口；当前视图仍显示在页签位置。 */
export function MobileSessionViewMore({ currentView, options, onSelect }: {
  currentView: string
  options: SecondarySessionViewOption[]
  onSelect: (view: SecondarySessionView) => void
}) {
  const [open, setOpen] = useState(false)
  const current = options.find(option => option.id === currentView)
  const hasAttention = options.some(option => option.attention)

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-current={current ? 'page' : undefined}
        aria-label={`更多会话视图${current ? `，当前${current.label}` : ''}`}
        className={cn(
          'relative inline-flex h-full shrink-0 items-center gap-1 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] md:hidden',
          'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full',
          current ? 'font-medium text-[var(--color-primary)] after:bg-[var(--color-primary)]'
            : 'text-[var(--color-muted-foreground)] after:bg-transparent',
        )}>
        <MoreHorizontal aria-hidden="true" className="size-3.5" />
        <span>{current?.label ?? '更多'}</span>
        {hasAttention && <span className="size-1.5 rounded-full bg-amber-500" aria-label="有待处理视图" />}
        <ChevronDown aria-hidden="true" className="size-3" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-52 max-w-[calc(100vw-2rem)] p-1 md:hidden" aria-label="更多会话视图">
      <div role="group" aria-label="选择会话视图">
        {options.map(option => <button key={option.id} type="button" aria-current={currentView === option.id ? 'page' : undefined}
          onClick={() => { setOpen(false); onSelect(option.id) }}
          className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
          <option.icon aria-hidden="true" className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <span className="flex-1">{option.label}</span>
          {option.attention && <span className="size-1.5 rounded-full bg-amber-500" aria-label="待处理" />}
          {currentView === option.id && <Check aria-hidden="true" className="size-4 text-[var(--color-primary)]" />}
        </button>)}
      </div>
    </PopoverContent>
  </Popover>
}
