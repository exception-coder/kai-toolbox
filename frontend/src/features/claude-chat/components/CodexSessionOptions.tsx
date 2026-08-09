import { useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, FolderKey, Gauge, SlidersHorizontal, Zap } from 'lucide-react'
import type { CodexReasoningEffort, CodexSpeed, ModelInfo } from '../types'

interface Props {
  models: ModelInfo[]
  model: string | null
  reasoningEffort: CodexReasoningEffort
  speed: CodexSpeed
  codexHome?: string | null
  codexHomes?: string[]
  codexHomesLoading?: boolean
  showCodexHome?: boolean
  advancedContent?: ReactNode
  disabled?: boolean
  onModelChange: (model: string) => void
  onOptionsChange: (effort: CodexReasoningEffort, speed: CodexSpeed) => void
  onCodexHomeChange?: (codexHome: string) => void
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
  codexHomes = [],
  codexHomesLoading,
  showCodexHome,
  advancedContent,
  disabled,
  onModelChange,
  onOptionsChange,
  onCodexHomeChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<'model' | 'effort' | 'speed' | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const selectedModel = models.find(item => item.value === model)
  const supportedEfforts = selectedModel?.reasoningEfforts?.length ? selectedModel.reasoningEfforts : DEFAULT_EFFORTS
  const visibleEfforts = supportedEfforts.map(value => ({ value, label: effortLabel(value) }))
  const fastSupported = !selectedModel || selectedModel.fastSupported !== false
  const authHomeLabel = codexHome?.trim() || '默认目录（%USERPROFILE%\\.codex）'
  const modelLabel = selectedModel?.displayName || model || '默认模型'
  const effortValueLabel = EFFORT_LABELS[reasoningEffort] ?? reasoningEffort
  const speedLabel = SPEEDS.find(item => item.value === speed)?.label ?? speed

  const changeModel = (nextModel: string) => {
    onModelChange(nextModel)
    const next = models.find(item => item.value === nextModel)
    const nextEfforts = next?.reasoningEfforts ?? []
    const nextEffort = nextEfforts.length && !nextEfforts.includes(reasoningEffort)
      ? next?.defaultReasoningEffort ?? nextEfforts[0]
      : reasoningEffort
    onOptionsChange(nextEffort, next?.fastSupported === false ? 'default' : speed)
  }

  const close = () => {
    setOpen(false)
    setActiveSection(null)
  }

  const pickModel = (value: string) => {
    changeModel(value)
    close()
  }

  const pickEffort = (value: CodexReasoningEffort) => {
    onOptionsChange(value, speed)
    close()
  }

  const pickSpeed = (value: CodexSpeed) => {
    onOptionsChange(reasoningEffort, value)
    close()
  }

  return (
    <div className="relative min-w-0 max-w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(value => !value); setActiveSection(null) }}
        aria-label="配置 Codex 模型、推理强度和速度"
        title="Codex 模型配置，下轮生效"
        className="flex h-8 w-auto max-w-full min-w-0 items-center gap-1.5 rounded-md border bg-[var(--color-background)] px-2.5 text-xs disabled:opacity-50 sm:max-w-80"
      >
        <SlidersHorizontal className="size-3.5 shrink-0 text-[var(--color-primary)]" />
        <span className="truncate font-medium">{modelLabel}</span>
        <span className="shrink-0 text-[var(--color-muted-foreground)]">· {effortValueLabel} · {speedLabel}</span>
        <ChevronDown className={`ml-1 size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border bg-[var(--color-background)] p-2 shadow-xl">
            {activeSection === null ? (
              <>
                <div className="px-2 pb-1.5 pt-1 text-xs font-medium text-[var(--color-muted-foreground)]">Codex 配置 · 下轮生效</div>
                <ConfigRow label="模型" value={modelLabel} onClick={() => setActiveSection('model')} />
                <ConfigRow label="推理强度" value={effortValueLabel} icon={<Gauge className="size-4" />} onClick={() => setActiveSection('effort')} />
                <ConfigRow label="速度" value={speedLabel} icon={<Zap className="size-4" />} onClick={() => setActiveSection('speed')} />
                {(showCodexHome || advancedContent) && (
                  <>
                    <div className="my-1 border-t" />
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(value => !value)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                    >
                      高级
                      <ChevronDown className={`ml-auto size-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    </button>
                    {showAdvanced && (
                      <div className="space-y-2">
                        {showCodexHome && (
                          <div className="flex min-w-0 items-start gap-2 rounded-lg bg-[var(--color-muted)] px-2 py-2 text-xs" title={`当前会话 Codex Auth 目录：${authHomeLabel}`}>
                            <FolderKey className="mt-0.5 size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                            <div className="min-w-0 flex-1">
                              <div className="text-[var(--color-muted-foreground)]">Auth 目录</div>
                              {onCodexHomeChange ? (
                                <select
                                  value={codexHome ?? ''}
                                  onChange={(event) => onCodexHomeChange(event.target.value)}
                                  disabled={disabled || codexHomesLoading || codexHomes.length === 0}
                                  aria-label="Codex 授权目录"
                                  className="mt-1 h-8 w-full rounded-md border bg-[var(--color-background)] px-2 text-xs text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
                                >
                                  {codexHomes.length === 0 && (
                                    <option value="">{codexHomesLoading ? '正在加载授权目录…' : '未发现 .codex 前缀目录'}</option>
                                  )}
                                  {codexHomes.map(path => <option key={path} value={path}>{path}</option>)}
                                </select>
                              ) : (
                                <div className="truncate text-[var(--color-foreground)]">{authHomeLabel}</div>
                              )}
                            </div>
                          </div>
                        )}
                        {advancedContent}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveSection(null)}
                  className="mb-1 flex w-full items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium hover:bg-[var(--color-accent)]"
                >
                  <ChevronLeft className="size-4" />
                  {activeSection === 'model' ? '模型' : activeSection === 'effort' ? '推理强度' : '速度'}
                </button>
                <div className="max-h-72 overflow-y-auto">
                  {activeSection === 'model' && (
                    <>
                      <OptionRow label="默认模型" selected={!model} onClick={() => pickModel('')} />
                      {models.map(item => (
                        <OptionRow key={item.value} label={item.displayName || item.value} selected={item.value === model} onClick={() => pickModel(item.value)} />
                      ))}
                    </>
                  )}
                  {activeSection === 'effort' && visibleEfforts.map(item => (
                    <OptionRow key={item.value} label={item.label} selected={item.value === reasoningEffort} onClick={() => pickEffort(item.value)} />
                  ))}
                  {activeSection === 'speed' && SPEEDS.map(item => (
                    <OptionRow
                      key={item.value}
                      label={item.label}
                      selected={item.value === speed}
                      disabled={item.value === 'fast' && !fastSupported}
                      onClick={() => pickSpeed(item.value)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ConfigRow({ label, value, icon, onClick }: {
  label: string
  value: string
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-sm hover:bg-[var(--color-accent)]">
      <span className="flex w-5 shrink-0 justify-center text-[var(--color-muted-foreground)]">{icon}</span>
      <span>{label}</span>
      <span className="ml-auto max-w-40 truncate text-[var(--color-muted-foreground)]">{value}</span>
      <ChevronRight className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
    </button>
  )
}

function OptionRow({ label, selected, disabled, onClick }: {
  label: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--color-accent)] disabled:opacity-40"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  )
}
