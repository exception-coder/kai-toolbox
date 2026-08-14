import { Check, MonitorCog, Moon, Sparkles, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { handleAppearanceRadioKeyDown } from './appearanceRadioGroup'
import {
  THEME_ACCENTS,
  THEME_MODES,
  updateTheme,
  type ThemeAccent,
  type ThemeMode,
  type ThemeState,
} from './theme'

const MODE_ICONS = {
  light: Sun,
  dark: Moon,
  black: Sparkles,
  system: MonitorCog,
} satisfies Record<ThemeMode, typeof Sun>

interface AppearanceModePickerProps {
  mode: ThemeMode
  compact?: boolean
}

export function AppearanceModePicker({ mode, compact = false }: AppearanceModePickerProps) {
  const optionIds = THEME_MODES.map(option => option.id)
  return (
    <fieldset>
      <legend className="appearance-setting-label">显示模式</legend>
      <div
        className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}
        role="radiogroup"
        onKeyDown={event => handleAppearanceRadioKeyDown(event, optionIds, mode, id => updateTheme({ mode: id }))}
      >
        {THEME_MODES.map(option => {
          const Icon = MODE_ICONS[option.id]
          const selected = mode === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => updateTheme({ mode: option.id })}
              className={cn(
                'appearance-choice min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                selected && 'appearance-choice-selected',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate text-sm font-medium">{option.label}</span>
              </span>
              {selected && <Check className="size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />}
              {!compact && <span className="col-span-2 text-left text-[11px] leading-4 text-[var(--color-muted-foreground)]">{option.description}</span>}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

interface AppearanceAccentPickerProps {
  accent: ThemeAccent
  compact?: boolean
}

export function AppearanceAccentPicker({ accent, compact = false }: AppearanceAccentPickerProps) {
  const optionIds = THEME_ACCENTS.map(option => option.id)
  return (
    <fieldset>
      <legend className="appearance-setting-label">主题色</legend>
      <div
        className={cn('flex flex-wrap', compact ? 'gap-2' : 'gap-3')}
        role="radiogroup"
        onKeyDown={event => handleAppearanceRadioKeyDown(event, optionIds, accent, id => updateTheme({ accent: id }))}
      >
        {THEME_ACCENTS.map(option => {
          const selected = accent === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              aria-label={option.label}
              title={option.label}
              onClick={() => updateTheme({ accent: option.id })}
              className={cn(
                'group flex min-h-11 items-center gap-2 rounded-lg px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                !compact && 'pr-2.5 hover:bg-[var(--color-muted)]',
              )}
            >
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 border-transparent shadow-sm transition-transform group-hover:scale-105',
                  selected && 'ring-2 ring-[var(--color-foreground)] ring-offset-2 ring-offset-[var(--color-card)]',
                )}
                style={{ background: option.swatch }}
                aria-hidden="true"
              >
                {selected && <Check className="size-4 text-white drop-shadow" strokeWidth={3} />}
              </span>
              {!compact && <span className="text-xs font-medium">{option.label}</span>}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function ThemeSummary({ state }: { state: ThemeState }) {
  const material = state.material === 'standard'
    ? '标准材质'
    : state.material === 'soft'
      ? '柔和材质'
      : state.material === 'paper'
        ? '纸张材质'
        : state.material === 'glass'
          ? '玻璃材质'
          : state.material === 'ink'
            ? '墨水材质'
            : '自然材质'
  return <span className="text-xs text-[var(--color-muted-foreground)]">当前：{material}</span>
}
