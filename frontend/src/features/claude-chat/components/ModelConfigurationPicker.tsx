import { useEffect, useId, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { Engine, ModelInfo } from '../types'
import { modelConfigurationCapabilities, REASONING_LABELS } from '../lib/modelConfigurationCapabilities'

export interface ModelConfigurationSelection {
  effort: string
  speed: 'default' | 'fast'
  ultracode: boolean
}

interface Props {
  engine: Engine
  engineLabel: string
  models: ModelInfo[]
  model: string | null
  selection: ModelConfigurationSelection
  gateway: boolean
  disabled?: boolean
  refreshing?: boolean
  onChange: (model: string, selection?: ModelConfigurationSelection) => void
  onEffortChange: (value: string) => void
  onSpeedChange: (value: 'default' | 'fast') => void
  onResetClaudeOptions: () => void
  onRefresh: () => void
}

/** 所有引擎共用呈现；参数和选项只来自对应适配器返回的模型能力。 */
export function ModelConfigurationPicker({ engine, engineLabel, models, model, selection, gateway, disabled,
  refreshing, onChange, onEffortChange, onSpeedChange, onResetClaudeOptions, onRefresh }: Props) {
  const id = useId()
  const [manualModel, setManualModel] = useState(model ?? '')
  const [pending, setPending] = useState<{ model: string; selection: ModelConfigurationSelection; changes: string[] } | null>(null)
  useEffect(() => { setManualModel(model ?? ''); setPending(null) }, [model, engine, gateway, models])
  const capabilities = modelConfigurationCapabilities(engine, models, model)
  const selectedMissing = Boolean(model && !capabilities.model)
  const effortUnsupported = capabilities.reasoning && !capabilities.reasoning.options.includes(selection.effort)
  const fastUnavailable = engine === 'codex' && selection.speed === 'fast' && capabilities.model?.fastSupported === false
  const claudeOptionsUnsupported = engine === 'claude' && capabilities.known && selection.effort !== 'auto'
    && (capabilities.model?.supportsEffort === false || effortUnsupported)

  const chooseModel = (nextModel: string) => {
    const next = modelConfigurationCapabilities(engine, models, nextModel)
    const replacement = { ...selection }
    const changes: string[] = []
    if (engine !== 'antigravity' && next.reasoning && !next.reasoning.options.includes(selection.effort)) {
      const fallback = next.reasoning.defaultValue && next.reasoning.options.includes(next.reasoning.defaultValue)
        ? next.reasoning.defaultValue : next.reasoning.options[0]
      replacement.effort = fallback
      changes.push(`推理强度调整为 ${REASONING_LABELS[fallback] ?? fallback}`)
    }
    if (engine === 'claude' && next.model?.supportsEffort === false && selection.effort !== 'auto') {
      replacement.effort = 'auto'
      changes.push('推理强度恢复自动')
    }
    if (engine === 'codex' && next.model?.fastSupported === false && selection.speed === 'fast') {
      replacement.speed = 'default'
      changes.push('速度调整为标准')
    }
    if (changes.length) setPending({ model: nextModel, selection: replacement, changes })
    else onChange(nextModel)
  }

  const controlClass = 'h-11 min-w-0 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm disabled:opacity-50 md:h-9 md:text-xs'
  return <div className="space-y-3">
    <div className="space-y-2">
      <label htmlFor={`${id}-model`} className="text-sm font-medium">模型</label>
      <div className="flex items-center gap-2">
        {gateway && models.length === 0 ? <>
          <input id={`${id}-model`} value={manualModel} disabled={disabled} placeholder="手填网关模型 ID"
            onChange={event => setManualModel(event.target.value)} className={controlClass} />
          <button type="button" disabled={disabled || !manualModel.trim() || manualModel.trim() === model}
            onClick={() => chooseModel(manualModel.trim())} className="h-11 shrink-0 rounded-md border px-2 text-xs disabled:opacity-50 md:h-9">应用</button>
        </> : <select id={`${id}-model`} value={model ?? ''} disabled={disabled}
          onChange={event => chooseModel(event.target.value)} className={controlClass}>
          <option value="">{gateway ? '网关默认模型' : '当前账号默认模型'}</option>
          {model && !models.some(item => item.value === model) && <option value={model}>
            {capabilities.model?.displayName ?? model}{selectedMissing ? '（当前选择，目录未核验）' : '（当前模型）'}
          </option>}
          {models.map(item => <option key={item.value} value={item.value}>{item.displayName}</option>)}
        </select>}
        <button type="button" onClick={onRefresh} disabled={disabled || refreshing}
          aria-label={gateway ? '重新同步网关模型' : `重新同步 ${engineLabel} 模型`} title="重新同步模型目录"
          className="flex size-11 shrink-0 items-center justify-center rounded-md border hover:bg-[var(--color-accent)] disabled:opacity-50 md:size-9">
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {models.length === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">
        {gateway ? '暂无已核验模型。可手填模型 ID；认证失败时请先核对服务商配置。' : '模型目录尚未加载，可重新同步。'}
      </p>}
      {selectedMissing && <p role="status" className="text-xs text-[var(--color-muted-foreground)]">当前模型目录尚未核验，已保留原选择；可同步模型或选择账号默认模型。</p>}
    </div>
    {capabilities.reasoning && <div className="space-y-2">
      <label htmlFor={`${id}-effort`} className="text-sm font-medium">推理强度</label>
      <select id={`${id}-effort`} value={selection.effort} disabled={disabled || engine === 'antigravity'} className={controlClass}
        onChange={event => onEffortChange(event.target.value)}>
        {effortUnsupported && <option disabled value={selection.effort}>{REASONING_LABELS[selection.effort] ?? selection.effort} · 当前模型未声明支持</option>}
        {capabilities.reasoning.options.map(value => <option key={value} value={value}>{REASONING_LABELS[value] ?? value}{value === 'auto' ? ' · 跟随引擎' : ''}</option>)}
      </select>
      {engine === 'antigravity' && <p className="text-xs text-[var(--color-muted-foreground)]">强度由所选模型变体提供；更改请切换模型。</p>}
      {engine === 'claude' && <p className="text-xs text-[var(--color-muted-foreground)]">调整强度时，会同时应用高级设置中的 Ultracode 开关。</p>}
    </div>}
    {capabilities.speed && <div className="space-y-2">
      <label htmlFor={`${id}-speed`} className="text-sm font-medium">速度模式</label>
      <select id={`${id}-speed`} value={selection.speed} disabled={disabled} className={controlClass}
        onChange={event => onSpeedChange(event.target.value as 'default' | 'fast')}>
        <option value="default">标准</option><option value="fast">快速</option>
      </select>
    </div>}
    {fastUnavailable && <div role="status" className="text-xs text-[var(--color-muted-foreground)]">
      当前模型不支持已选的快速模式。<button type="button" disabled={disabled} className="underline disabled:opacity-50" onClick={() => onSpeedChange('default')}>切换为标准</button>
    </div>}
    {claudeOptionsUnsupported && <div role="status" className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
      当前模型不支持已保存的强度，请调整后发送。{' '}
      <button type="button" disabled={disabled} className="underline disabled:opacity-50" onClick={onResetClaudeOptions}>恢复自动</button>
    </div>}
    {!capabilities.known && model && <p className="text-xs text-[var(--color-muted-foreground)]">模型能力尚未核验，已保留当前选择；可重新同步。</p>}
    {pending && <div role="status" className="space-y-2 rounded-md border px-3 py-2 text-xs">
      <p>目标模型不支持部分当前设置：{pending.changes.join('、')}。</p>
      <div className="flex gap-3">
        <button type="button" disabled={disabled} className="font-medium text-[var(--color-primary)] disabled:opacity-50" onClick={() => { onChange(pending.model, pending.selection); setPending(null) }}>确认切换</button>
        <button type="button" onClick={() => setPending(null)}>取消</button>
      </div>
    </div>}
    <p className="text-xs text-[var(--color-muted-foreground)]">模型参数下轮生效；运行中的任务会继续。</p>
  </div>
}
