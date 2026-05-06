import { cn } from '@/lib/utils'
import { SLIDE_RATIOS, type SlideRatio } from '../types'

interface SlideRatioSwitcherProps {
  value: SlideRatio
  onChange: (next: SlideRatio) => void
}

export function SlideRatioSwitcher({ value, onChange }: SlideRatioSwitcherProps) {
  return (
    <div className="inline-flex rounded-md border bg-[var(--color-muted)] p-0.5">
      {SLIDE_RATIOS.map(r => (
        <button
          key={r.id}
          type="button"
          onClick={() => onChange(r.id)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            value === r.id
              ? 'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm'
              : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
