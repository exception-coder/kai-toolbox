import { FolderKey, Gauge, Zap } from 'lucide-react'
import type { CodexReasoningEffort, CodexSpeed, ModelInfo } from '../types'

interface Props {
  models: ModelInfo[]
  model: string | null
  reasoningEffort: CodexReasoningEffort
  speed: CodexSpeed
  codexHome?: string | null
  showCodexHome?: boolean
  disabled?: boolean
  onModelChange: (model: string) => void
  onOptionsChange: (effort: CodexReasoningEffort, speed: CodexSpeed) => void
}

const DEFAULT_EFFORTS: CodexReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
]

const EFFORT_LABELS: Record<string, string> = {
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最大',
  ultra: '极致',
}

const OFFICIAL_VISIBLE_EFFORTS = new Set([
  'low',
  'medium',
  'high',
  'xhigh',
  'ultra',
])

function effortLabel(value: string) {
  const label = EFFORT_LABELS[value] ?? value
  if (value === 'max') return `${label} · 官方隐藏`
  if (value === 'ultra') return `${label} Ultra · 官方高消耗`
  if (OFFICIAL_VISIBLE_EFFORTS.has(value)) return `${label} · 官方`
  return `${label} · 扩展`
}

const SPEEDS: Array<{ value: CodexSpeed; label: string }> = [
  { value: 'default', label: '标准' },
  { value: 'fast', label: '快速' },
]

export function CodexSessionOptions({
  models,
  model,
  reasoningEffort,
  speed,
  codexHome,
  showCodexHome,
  disabled,
  onModelChange,
  onOptionsChange,
}: Props) {
  const selectedModel = models.find(item => item.value === model)
  const supportedEfforts = selectedModel?.reasoningEfforts?.length ? selectedModel.reasoningEfforts : DEFAULT_EFFORTS
  const visibleEfforts = supportedEfforts.map(value => ({ value, label: effortLabel(value) }))
  const fastSupported = !selectedModel || selectedModel.fastSupported !== false
  const authHomeLabel = codexHome?.trim() || '默认目录（%USERPROFILE%\\.codex）'

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
      <label className="flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs text-[var(--color-muted-foreground)]" title="推理强度：保留协议支持的全部档位；官方隐藏表示官方客户端默认不展示">
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
      <label className="flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs text-[var(--color-muted-foreground)]" title="速度，下轮生效">
        <Zap className="size-3.5" />
        <select
          value={speed}
          disabled={disabled}
          onChange={event => onOptionsChange(reasoningEffort, event.target.value as CodexSpeed)}
          aria-label="Codex 速度"
          className="bg-transparent text-[var(--color-foreground)] outline-none disabled:opacity-50"
        >
          {SPEEDS.map(item => (
            <option key={item.value} value={item.value} disabled={item.value === 'fast' && !fastSupported}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {showCodexHome && (
        <span
          className="flex h-7 min-w-0 max-w-64 items-center gap-1 rounded-md border px-2 text-xs text-[var(--color-muted-foreground)]"
          title={`当前会话 Codex Auth 目录：${authHomeLabel}`}
        >
          <FolderKey className="size-3.5 shrink-0" />
          <span className="shrink-0">Auth</span>
          <span className="truncate text-[var(--color-foreground)]">{authHomeLabel}</span>
        </span>
      )}
    </div>
  )
}
