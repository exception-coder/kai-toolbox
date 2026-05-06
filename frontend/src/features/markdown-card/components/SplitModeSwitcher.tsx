import { cn } from '@/lib/utils'
import { SPLIT_MODES, type SplitMode } from '../types'

interface SplitModeSwitcherProps {
  value: SplitMode
  onChange: (next: SplitMode) => void
}

export function SplitModeSwitcher({ value, onChange }: SplitModeSwitcherProps) {
  return (
    <div className="inline-flex rounded-md border bg-[var(--color-muted)] p-0.5">
      {SPLIT_MODES.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.hint}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === m.id
              ? 'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm'
              : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
