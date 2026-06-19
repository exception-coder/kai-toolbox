import { useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModelPicker } from './ModelPicker'
import type { ModelInfo, RolePreset } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  models: ModelInfo[]
  selectedModel: string
  onModelChange: (id: string) => void
  presets: RolePreset[]
  activeSystemPrompt: string | null
  onPickPreset: (preset: RolePreset) => void
  temperature: number
  onTemperatureChange: (t: number) => void
  fallback: boolean
  onRefreshModels: () => void
  disabled: boolean
}

/**
 * 会话参数设置抽屉：把模型 / 温度 / 角色预设从聊天主界面移到这里，
 * 让输入区回归纯对话（参数是「偶尔调」，不该常驻抢戏）。右侧滑出，Esc / 点遮罩关闭。
 */
export function SettingsDrawer(props: Props) {
  const { open, onClose, disabled } = props
  // 选中模型是否支持自定义温度；清单里查不到（兜底/未知）时默认支持，不误藏。
  const supportsTemp = props.models.find((m) => m.id === props.selectedModel)?.supportsTemperature ?? true

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col border-l border-[var(--color-border)] bg-[var(--color-background)] shadow-xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">会话设置</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* 模型 */}
          <section className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">模型</label>
              <Button variant="ghost" size="icon" className="ml-auto size-7" title="刷新模型清单" onClick={props.onRefreshModels}>
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
            <ModelPicker models={props.models} value={props.selectedModel} onChange={props.onModelChange} disabled={disabled} className="h-9 w-full text-sm" />
            {props.fallback && (
              <p className="text-[11px] text-[var(--color-muted-foreground)]">当前为兜底清单（4sapi 不可达），可点刷新重试。</p>
            )}
          </section>

          {/* 角色预设 */}
          <section className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">角色预设</label>
            <select
              className="h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
              value=""
              disabled={disabled}
              onChange={(e) => {
                const p = props.presets.find((x) => x.id === e.target.value)
                if (p) props.onPickPreset(p)
                e.target.value = ''
              }}
            >
              <option value="">选择一个角色预设…</option>
              {props.presets.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {props.activeSystemPrompt && (
              <p className="rounded-md bg-[var(--color-muted)] px-2 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
                当前系统提示：{props.activeSystemPrompt}
              </p>
            )}
          </section>

          {/* 温度：推理模型不支持自定义温度，隐藏滑块并说明 */}
          {supportsTemp ? (
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--color-muted-foreground)]">温度</label>
                <span className="text-xs tabular-nums text-[var(--color-foreground)]">{props.temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={props.temperature}
                disabled={disabled}
                onChange={(e) => props.onTemperatureChange(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--color-muted-foreground)]">
                <span>严谨 0</span>
                <span>发散 2</span>
              </div>
            </section>
          ) : (
            <section className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">温度</label>
              <p className="rounded-md bg-[var(--color-muted)] px-2 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
                该模型为推理模型，不支持调节温度（使用模型默认值）。
              </p>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
