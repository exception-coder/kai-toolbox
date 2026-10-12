import { useState } from 'react'
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react'
import {
  DEFAULT_THEME_STATE, THEME_ACCENTS, THEME_DENSITIES, THEME_MATERIALS, THEME_MODES,
  getThemeSnapshot, resetTheme, updateTheme, type ThemeState,
} from './theme'

export function AppearanceConfigurationActions({ state }: { state: ThemeState }) {
  const [appliedState, setAppliedState] = useState<ThemeState | null>(null)
  const applied = appliedState === state
  const isDefault = JSON.stringify(state) === JSON.stringify(DEFAULT_THEME_STATE)
  const summary = [
    THEME_MODES.find(option => option.id === state.mode)?.label,
    THEME_MATERIALS.find(option => option.id === state.material)?.label,
    THEME_ACCENTS.find(option => option.id === state.accent)?.label,
    THEME_DENSITIES.find(option => option.id === state.density)?.label,
  ].join(' · ')

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/55 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4 text-[var(--color-primary)]" aria-hidden="true" />当前外观配置</div>
        <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">{summary}</p>
        <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">所选配置即时生效并自动保存。</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button" disabled={isDefault} onClick={resetTheme} title="恢复产品默认外观"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />恢复默认
        </button>
        <button
          type="button" disabled={applied} onClick={() => setAppliedState(updateTheme(getThemeSnapshot()))}
          aria-label={applied ? '已应用当前配置' : '应用当前配置'}
          title="应用当前选择的模式、材质、主题色、密度与舒适度"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {applied && <Check className="size-3.5" aria-hidden="true" />}<span role="status">{applied ? '已应用当前配置' : '应用当前配置'}</span>
        </button>
      </div>
    </div>
  )
}
