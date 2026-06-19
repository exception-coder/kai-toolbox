import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { RolePreset } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  presets: RolePreset[]
  activeSystemPrompt: string | null
  onPickPreset: (preset: RolePreset) => void
  temperature: number
  onTemperatureChange: (t: number) => void
  /** 当前模型是否支持自定义温度；false 时隐藏温度滑块。 */
  supportsTemperature: boolean
  disabled: boolean
}

/**
 * 高级参数抽屉：模型已提升到标题栏常驻选择，这里只放低频配置（角色预设 / 温度）。
 * 右侧滑出，Esc / 点遮罩关闭。
 */
export function SettingsDrawer(props: Props) {
  const { open, onClose, disabled } = props
  const supportsTemp = props.supportsTemperature

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
          <span className="text-sm font-medium">高级参数</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
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
