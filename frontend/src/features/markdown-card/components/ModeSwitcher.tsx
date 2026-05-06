import { cn } from '@/lib/utils'
import { MODES, type Mode } from '../types'

interface ModeSwitcherProps {
  value: Mode
  onChange: (next: Mode) => void
}

export function ModeSwitcher({ value, onChange }: ModeSwitcherProps) {
  return (
    <div className="inline-flex rounded-md border bg-[var(--color-muted)] p-0.5">
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.hint}
          className={cn(
            'rounded px-3 py-1.5 text-xs font-medium transition-colors',
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
