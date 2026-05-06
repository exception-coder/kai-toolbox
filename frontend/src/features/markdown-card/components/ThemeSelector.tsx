import { cn } from '@/lib/utils'
import { THEMES } from '../lib/themes'
import type { Theme } from '../types'

interface ThemeSelectorProps {
  value: Theme
  onChange: (next: Theme) => void
}

export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {THEMES.map(t => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
              active
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-foreground)]'
                : 'hover:bg-[var(--color-accent)] text-[var(--color-muted-foreground)]',
            )}
          >
            <span
              className="inline-block h-3 w-3 rounded-full border"
              style={{ background: t.preview }}
            />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
