import { Gauge, Zap } from 'lucide-react'
import type { CodexReasoningEffort, CodexSpeed, ModelInfo } from '../types'

interface Props {
  models: ModelInfo[]
  model: string | null
  reasoningEffort: CodexReasoningEffort
  speed: CodexSpeed
  disabled?: boolean
  onModelChange: (model: string) => void
  onOptionsChange: (effort: CodexReasoningEffort, speed: CodexSpeed) => void
}

const EFFORTS: Array<{ value: CodexReasoningEffort; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '超高' },
]

export function CodexSessionOptions({ models, model, reasoningEffort, speed, disabled, onModelChange, onOptionsChange }: Props) {
  const selectedModel = models.find(item => item.value === model)
  const supportedEfforts = selectedModel?.reasoningEfforts?.length ? selectedModel.reasoningEfforts : EFFORTS.map(item => item.value)
  const visibleEfforts = EFFORTS.filter(item => supportedEfforts.includes(item.value))
  const fastSupported = !selectedModel || selectedModel.fastSupported !== false

  const changeModel = (nextModel: string) => {
    onModelChange(nextModel)
    const next = models.find(item => item.value === nextModel)
    const nextEfforts = next?.reasoningEfforts ?? []
    const nextEffort = nextEfforts.length && !nextEfforts.includes(reasoningEffort)
      ? next?.defaultReasoningEffort ?? nextEfforts[0]
      : reasoningEffort
    onOptionsChange(nextEffort, next?.fastSupported === false ? 'default' : speed)
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <select
        value={model ?? ''}
        disabled={disabled}
        onChange={event => changeModel(event.target.value)}
        aria-label="Codex 模型"
        title="Codex 模型，下轮生效"
        className="h-7 max-w-40 rounded-md border bg-[var(--color-background)] px-2 text-xs disabled:opacity-50"
      >
        <option value="">默认模型</option>
        {models.map(item => <option key={item.value} value={item.value}>{item.displayName || item.value}</option>)}
      </select>
      <label className="flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs text-[var(--color-muted-foreground)]" title="推理强度，下轮生效">
        <Gauge className="size-3.5" />
        <select
          value={reasoningEffort}
          disabled={disabled}
          onChange={event => onOptionsChange(event.target.value as CodexReasoningEffort, speed)}
          aria-label="Codex 推理强度"
          className="bg-transparent text-[var(--color-foreground)] outline-none disabled:opacity-50"
        >
          {visibleEfforts.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled || !fastSupported}
        onClick={() => onOptionsChange(reasoningEffort, speed === 'fast' ? 'default' : 'fast')}
        title={!fastSupported ? '当前模型不支持 Fast' : speed === 'fast' ? 'Fast 已开启：约 1.5x 速度，会增加用量' : '开启 Fast：约 1.5x 速度，会增加用量'}
        className={`flex h-7 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50 ${speed === 'fast' ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'text-[var(--color-muted-foreground)]'}`}
      >
        <Zap className="size-3.5" /> Fast
      </button>
    </div>
  )
}
