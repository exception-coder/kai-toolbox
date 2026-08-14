import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { handleAppearanceRadioKeyDown } from './appearanceRadioGroup'
import {
  THEME_MATERIALS,
  previewTheme,
  restoreCommittedTheme,
  updateTheme,
  type ThemeMaterial,
} from './theme'

interface AppearanceMaterialPickerProps {
  material: ThemeMaterial
}

export function AppearanceMaterialPicker({ material }: AppearanceMaterialPickerProps) {
  const optionIds = THEME_MATERIALS.map(option => option.id)
  return (
    <fieldset>
      <legend className="appearance-setting-label">界面材质</legend>
      <p className="mb-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
        悬停可预览整个工作区，点击后自动保存。
      </p>
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
        role="radiogroup"
        onKeyDown={event => handleAppearanceRadioKeyDown(event, optionIds, material, id => updateTheme({ material: id }))}
      >
        {THEME_MATERIALS.map(option => (
          <MaterialOption
            key={option.id}
            option={option}
            selected={material === option.id}
          />
        ))}
      </div>
    </fieldset>
  )
}

interface MaterialOptionProps {
  option: (typeof THEME_MATERIALS)[number]
  selected: boolean
}

function MaterialOption({ option, selected }: MaterialOptionProps) {
  const startPreview = () => previewTheme({ material: option.id })
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      aria-describedby={`appearance-material-${option.id}`}
      onPointerEnter={event => { if (event.pointerType === 'mouse') startPreview() }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') restoreCommittedTheme() }}
      onFocus={startPreview}
      onBlur={restoreCommittedTheme}
      onClick={() => updateTheme({ material: option.id })}
      className={cn(
        'appearance-material-option group rounded-xl border bg-[var(--color-card)] p-2 text-left transition-[border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
        selected
          ? 'border-[var(--color-primary)] shadow-[0_0_0_1px_var(--color-primary)]'
          : 'border-[var(--color-border)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md',
      )}
    >
      <MaterialPreview previewClass={option.previewClass} selected={selected} />
      <span className="mt-2 flex items-center justify-between gap-2 px-0.5">
        <span className="text-sm font-medium">{option.label}</span>
        {selected && <Check className="size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />}
      </span>
      <span id={`appearance-material-${option.id}`} className="mt-0.5 block px-0.5 text-[11px] leading-4 text-[var(--color-muted-foreground)]">
        {option.description}
      </span>
    </button>
  )
}

function MaterialPreview({ previewClass, selected }: { previewClass: string; selected: boolean }) {
  return (
    <span className={cn('appearance-material-preview', previewClass)} aria-hidden="true">
      <span className="appearance-preview-sidebar">
        <span />
        <span />
        <span />
      </span>
      <span className="appearance-preview-workspace">
        <span className="appearance-preview-toolbar" />
        <span className="appearance-preview-sheet">
          <span className="appearance-preview-heading" />
          <span className="appearance-preview-line" />
          <span className="appearance-preview-line appearance-preview-line-short" />
        </span>
      </span>
      {selected && <span className="appearance-preview-selected-dot" />}
    </span>
  )
}
