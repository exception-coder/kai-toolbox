// 模板和主色选择器：紧凑呈现，适合放进页面工作台。
import { cn } from '@/lib/utils'
import { TEMPLATES, ACCENT_COLORS } from '../types'
import type { AccentColor, TemplateId } from '../types'

interface Props {
  template: TemplateId
  accent: AccentColor
  onTemplateChange: (t: TemplateId) => void
  onAccentChange: (c: AccentColor) => void
}

export function TemplateSelector({ template, accent, onTemplateChange, onAccentChange }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-[var(--color-background)]/70 p-3">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-[var(--color-muted-foreground)]">模板风格</span>
        <div className="grid grid-cols-2 gap-1.5">
        {TEMPLATES.map(t => {
          const active = template === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplateChange(t.id)}
              title={t.description}
              className={cn(
                'flex min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all',
                active
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]/30'
                  : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-accent)]',
              )}
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full border border-black/10"
                style={{ background: t.swatch }}
              />
              <span className="truncate">{t.label}</span>
            </button>
          )
        })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-[var(--color-muted-foreground)]">视觉主色</span>
        <div className="flex flex-wrap items-center gap-2">
        {ACCENT_COLORS.map(c => {
          const active = accent === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onAccentChange(c.id)}
              title={c.label}
              className={cn(
                'relative h-7 w-7 rounded-full border-2 transition-all',
                active
                  ? 'scale-110 border-[var(--color-foreground)] shadow-md ring-2 ring-[var(--color-foreground)]/20'
                  : 'border-white shadow-sm hover:scale-105',
              )}
              style={{ background: c.hex }}
            >
              {active && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                  ✓
                </span>
              )}
            </button>
          )
        })}
        </div>
      </div>
    </div>
  )
}
