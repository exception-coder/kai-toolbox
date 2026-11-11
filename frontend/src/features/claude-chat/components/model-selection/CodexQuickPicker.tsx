import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, SlidersHorizontal } from 'lucide-react'
import type { CodexReasoningEffort, CodexSpeed, ModelInfo } from '../../types'
import { codexQuickPresets, QUICK_EFFORT_LABELS, type CodexQuickPreset } from '../../lib/codexQuickPresets'
import { compactSessionModelLabel } from '../SessionConfigSheet'
import '../../styles/codex-quick-picker.css'

interface Props {
  models: ModelInfo[]
  model: string | null
  effort: CodexReasoningEffort
  speed?: CodexSpeed
  refreshing?: boolean
  disabled?: boolean
  onApply: (preset: CodexQuickPreset) => void
  onCustom: () => void
}

/** 离散滑杆只在松手、键盘确认或显式点选时应用，拖动中不发送配置帧。 */
export function CodexQuickPicker({ models, model, effort, speed = 'default', refreshing, disabled, onApply, onCustom }: Props) {
  const presets = useMemo(() => codexQuickPresets(models), [models])
  const effectiveModel = model || models.find(item => item.isDefault)?.value
  const selected = presets.findIndex(item => item.model === effectiveModel && item.effort === effort)
  const [draft, setDraft] = useState<number | null>(null)
  const [pendingSpeedChange, setPendingSpeedChange] = useState<CodexQuickPreset | null>(null)
  const pending = useRef<number | null>(null)
  useEffect(() => { pending.current = null; setDraft(null); setPendingSpeedChange(null) }, [models, model, effort, speed, refreshing, disabled])
  const shown = draft ?? selected
  const preset = presets[shown]
  const currentLabel = models.find(item => item.value === effectiveModel)?.displayName || model || '默认模型'
  const currentEffort = QUICK_EFFORT_LABELS[effort] || effort
  const label = preset ? `${compactSessionModelLabel(preset.modelLabel)} ${preset.effortLabel}`
    : `${compactSessionModelLabel(currentLabel)} ${currentEffort} · 自定义`
  const locked = Boolean(disabled || refreshing || presets.length === 0)
  const preview = (index: number) => { pending.current = index; setDraft(index) }
  const cancel = () => { pending.current = null; setDraft(null) }
  const apply = (index: number) => {
    const choice = presets[index]
    if (!locked && choice && (choice.model !== effectiveModel || choice.effort !== effort)) {
      if (speed === 'fast' && !choice.fastSupported) setPendingSpeedChange(choice)
      else onApply(choice)
    }
    cancel()
  }
  const confirm = () => { if (pending.current != null) apply(pending.current) }

  return <section className="cc-codex-quick-picker" aria-label="Codex 快捷组合">
    <button type="button" onClick={onCustom} disabled={disabled} className="cc-quick-current"
      aria-label={`当前 ${label}，自定义模型和推理强度`}>
      <span aria-live="polite">{label}</span><ChevronRight aria-hidden="true" className="size-4" />
    </button>
    <p className="cc-quick-hint">滑动选择模型与推理强度，松手后下轮生效。</p>
    {pendingSpeedChange && <div role="status" className="space-y-2 rounded-md border p-2 text-xs">
      <p>目标模型不支持快速模式，切换后速度会调整为标准。</p>
      <div className="flex gap-3"><button type="button" disabled={disabled || refreshing} onClick={() => { onApply(pendingSpeedChange); setPendingSpeedChange(null) }}>确认切换</button>
        <button type="button" onClick={() => setPendingSpeedChange(null)}>取消</button></div>
    </div>}
    {presets.length > 0 ? <>
      <div className="cc-quick-range" data-custom={shown < 0 ? 'true' : undefined}>
        <input type="range" min={0} max={presets.length - 1} step={1} value={Math.max(0, shown)}
          aria-label="模型与推理强度组合" aria-valuetext={label} disabled={locked}
          onChange={event => preview(Number(event.target.value))}
          onPointerDown={event => { if (!locked) preview(Number(event.currentTarget.value)) }}
          onPointerUp={confirm} onPointerCancel={cancel} onBlur={confirm}
          onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) confirm() }} />
      </div>
      <div className="cc-quick-stops" style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}>
        {presets.map((item, index) => <button key={`${item.model}:${item.effort}`} type="button"
          aria-label={`选择 ${item.label}`} aria-pressed={shown === index} disabled={locked}
          onClick={() => apply(index)} title={item.label}>
          <span className="cc-quick-dot" aria-hidden="true" />
          <span className="cc-quick-stop-label">{compactSessionModelLabel(item.modelLabel).split(' ').at(-1)}<br />{item.effortLabel}</span>
        </button>)}
      </div>
    </> : <p role="status" className="cc-quick-unavailable">{refreshing ? '正在同步可用组合…' : '暂无已确认的快捷组合，可进入自定义同步模型目录。'}</p>}
    <button type="button" onClick={onCustom} disabled={disabled} className="cc-quick-custom">
      <SlidersHorizontal aria-hidden="true" className="size-4" />自定义模型与参数
    </button>
  </section>
}
