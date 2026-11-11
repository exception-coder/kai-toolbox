import { useId } from 'react'
import type { ClaudeSessionOptions } from '../types'

/** Claude 原生 Ultracode 是独立的动态工作流开关。 */
export function ClaudeUltracodeOption({ options, disabled, onChange }: {
  options: ClaudeSessionOptions
  disabled?: boolean
  onChange: (options: ClaudeSessionOptions) => void
}) {
  const id = useId()
  return <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <span id={id} className="text-sm font-medium">Ultracode</span>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        SDK 提供此开关，模型及工作流是否支持由引擎决定。未设置前沿用引擎；调整强度时会同时应用此处的选择。
      </p>
    </div>
    <button type="button" role="switch" aria-checked={options.ultracode} aria-labelledby={id}
      disabled={disabled}
      onClick={() => onChange({ ...options, ultracode: !options.ultracode })}
      className="min-h-11 shrink-0 rounded-md border px-3 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50 md:min-h-9">
      {options.ultracode ? '开启' : '关闭'}
    </button>
  </div>
}
