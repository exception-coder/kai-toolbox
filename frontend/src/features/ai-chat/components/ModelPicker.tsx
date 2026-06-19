import { cn } from '@/lib/utils'
import type { ModelInfo } from '../types'
import { groupModels } from '../lib/modelGroups'

interface Props {
  models: ModelInfo[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
}

/** 模型下拉：原生 select + optgroup 按平台二级分组，零依赖、主题色对齐设计系统。 */
export function ModelPicker({ models, value, onChange, disabled, className }: Props) {
  const known = models.some((m) => m.id === value)
  const groups = groupModels(models)
  return (
    <select
      className={cn(
        'h-8 rounded-md border bg-[var(--color-background)] px-2 text-xs',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
        'disabled:opacity-50',
        className,
      )}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {!known && value && <option value={value}>{value}</option>}
      {groups.map((g) => (
        <optgroup key={g.key} label={g.label}>
          {g.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.multimodal ? ' 🖼' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
