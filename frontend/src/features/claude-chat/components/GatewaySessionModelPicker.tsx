import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '../types'

/** 已绑定第三方网关的 Claude 会话模型选择，目录失败时保留当前模型身份。 */
export function GatewaySessionModelPicker({
  models, currentModel, refreshing, disabled, onChange, onRefresh,
}: {
  models: ModelInfo[]
  currentModel: string | null
  refreshing: boolean
  disabled: boolean
  onChange: (model: string) => void
  onRefresh: () => void
}) {
  const [manualModel, setManualModel] = useState(currentModel ?? '')
  useEffect(() => setManualModel(currentModel ?? ''), [currentModel])
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="claude-gateway-session-model" className="text-sm font-medium">网关模型</label>
      <div className="flex items-center gap-2">
        {models.length > 0 ? <select
          id="claude-gateway-session-model"
          value={currentModel ?? ''}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          className="h-8 min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 text-xs disabled:opacity-50"
        >
          <option value="">网关默认模型</option>
          {currentModel && !models.some(model => model.value === currentModel) && (
            <option value={currentModel}>{currentModel}（当前选择，目录未核验）</option>
          )}
          {models.map(model => <option key={model.value} value={model.value}>{model.displayName}</option>)}
        </select> : <>
          <input
            id="claude-gateway-session-model"
            value={manualModel}
            onChange={event => setManualModel(event.target.value)}
            disabled={disabled}
            placeholder="手填网关模型 ID"
            className="h-8 min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 text-xs disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => onChange(manualModel.trim())}
            disabled={disabled || !manualModel.trim() || manualModel.trim() === currentModel}
            className="h-8 shrink-0 rounded-md border px-2 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
          >应用</button>
        </>}
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || refreshing}
          aria-label="重新同步网关模型"
          title="重新读取当前服务商的模型目录"
          className="flex size-8 shrink-0 items-center justify-center rounded-md border hover:bg-[var(--color-accent)] disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
        </button>
      </div>
      {models.length === 0 && (
        <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
          暂无已核验模型。可手填模型 ID 后应用；若是 401 认证失败，请先核对档案 API Key，手填不能绕过认证。
        </p>
      )}
    </div>
  )
}
