import { Thermometer } from 'lucide-react'

/**
 * 标题栏内联温度控件：选中支持温度的模型后常驻显示，用户随时滑动、无需打开任何面板。
 * 0 严谨 ~ 2 发散。
 */
export function TemperatureControl({ value, onChange }: { value: number; onChange: (t: number) => void }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 rounded-full border bg-[var(--color-background)] px-2.5 py-1"
      title={`温度 ${value.toFixed(1)}（0 严谨 ~ 2 发散），可随时拖动`}
    >
      <Thermometer className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
      <input
        type="range"
        min={0}
        max={2}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-20 accent-[var(--color-primary)]"
        aria-label="温度"
      />
      <span className="w-6 shrink-0 text-right text-xs tabular-nums">{value.toFixed(1)}</span>
    </div>
  )
}
