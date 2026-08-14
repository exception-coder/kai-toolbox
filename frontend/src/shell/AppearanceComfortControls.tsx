import { BookOpenText, Check, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { handleAppearanceRadioKeyDown } from './appearanceRadioGroup'
import { DEFAULT_THEME_STATE, THEME_DENSITIES, resetTheme, updateTheme, type ThemeState } from './theme'

const COMFORT_OPTIONS = [
  { id: 'reduceContrast', label: '降低对比度', description: '柔化边界与次级文字，正文仍保持清晰' },
  { id: 'warmTone', label: '暖色温', description: '只调整中性表面，不影响状态色和图片' },
  { id: 'reduceTransparency', label: '减少透明效果', description: '玻璃材质使用不透明表面回退' },
  { id: 'reduceMotion', label: '减少动画', description: '保留必要进度反馈，减少装饰性动效' },
] as const

export function AppearanceComfortControls({ state }: { state: ThemeState }) {
  const densityIds = THEME_DENSITIES.map(option => option.id)
  const readingPresetActive = state.material === 'ink'
    && state.density === 'comfortable'
    && Object.values(state.comfort).every(Boolean)
  const isDefault = JSON.stringify(state) === JSON.stringify(DEFAULT_THEME_STATE)

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="appearance-setting-label">界面密度</legend>
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          role="radiogroup"
          onKeyDown={event => handleAppearanceRadioKeyDown(event, densityIds, state.density, id => updateTheme({ density: id }))}
        >
          {THEME_DENSITIES.map(option => {
            const selected = state.density === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => updateTheme({ density: option.id })}
                className={cn(
                  'appearance-choice min-h-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                  selected && 'appearance-choice-selected',
                )}
              >
                <span className="text-sm font-medium">{option.label}</span>
                {selected && <Check className="size-4 text-[var(--color-primary)]" aria-hidden="true" />}
                <span className="col-span-2 text-left text-[11px] leading-4 text-[var(--color-muted-foreground)]">{option.description}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="appearance-setting-label">舒适度</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMFORT_OPTIONS.map(option => {
            const checked = state.comfort[option.id]
            return (
              <button
                key={option.id}
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => updateTheme({ comfort: { [option.id]: !checked } })}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-left hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                <span className={cn('appearance-switch shrink-0', checked && 'appearance-switch-on')} aria-hidden="true">
                  <span />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[var(--color-muted-foreground)]">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
        {state.material === 'glass' && state.comfort.reduceTransparency && (
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">玻璃偏好已保留，当前按舒适度设置显示为实体表面。</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/55 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium"><BookOpenText className="size-4 text-[var(--color-primary)]" />舒适阅读</div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">一键应用墨水材质、暖色温、柔和对比与少动画。</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={isDefault}
            onClick={resetTheme}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw className="size-3.5" />恢复默认
          </button>
          <button
            type="button"
            disabled={readingPresetActive}
            onClick={applyReadingPreset}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-medium text-[var(--color-primary-foreground)] shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {readingPresetActive && <Check className="size-3.5" />}{readingPresetActive ? '已应用' : '应用预设'}
          </button>
        </div>
      </div>
    </div>
  )
}

function applyReadingPreset() {
  updateTheme({
    material: 'ink',
    density: 'comfortable',
    comfort: {
      reduceContrast: true,
      warmTone: true,
      reduceTransparency: true,
      reduceMotion: true,
    },
  })
}
