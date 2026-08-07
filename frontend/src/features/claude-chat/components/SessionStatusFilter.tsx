import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DEFAULT_SESSION_STATUSES,
  SESSION_STATUS_OPTIONS,
  setVisibleSessionStatuses,
  useVisibleSessionStatuses,
  type SessionVisibilityStatus,
} from '../lib/sessionStatusFilter'

export function SessionStatusFilter({ compact = false }: { compact?: boolean }) {
  const statuses = useVisibleSessionStatuses()
  const isDefault = statuses.length === DEFAULT_SESSION_STATUSES.length
    && DEFAULT_SESSION_STATUSES.every(status => statuses.includes(status))

  const toggle = (status: SessionVisibilityStatus) => {
    if (statuses.includes(status)) {
      if (statuses.length === 1) return
      setVisibleSessionStatuses(statuses.filter(value => value !== status))
      return
    }
    setVisibleSessionStatuses([...statuses, status])
  }

  const summary = isDefault
    ? '有效会话'
    : SESSION_STATUS_OPTIONS.filter(option => statuses.includes(option.value)).map(option => option.label).join('、')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="按会话状态筛选（可多选）"
          title="按会话状态筛选；默认隐藏规划已过期会话"
          className={cn(
            'flex h-7 items-center gap-1 rounded-md border bg-[var(--color-background)] px-1.5 text-xs',
            compact ? 'max-w-28' : 'max-w-36',
            !isDefault && 'border-[var(--color-primary)] text-[var(--color-primary)]',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        {SESSION_STATUS_OPTIONS.map(option => {
          const checked = statuses.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]"
            >
              <span className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded border',
                checked && 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
              )}>
                {checked && <Check className="size-3" />}
              </span>
              {option.label}
            </button>
          )
        })}
        <p className="border-t px-2 pt-1.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">
          至少保留一项，选择会同步到两个会话列表
        </p>
      </PopoverContent>
    </Popover>
  )
}

