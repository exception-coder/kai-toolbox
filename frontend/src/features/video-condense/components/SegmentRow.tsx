import type { SegmentView } from '../types'

const SPEEDS = [0.5, 1, 1.25, 1.5, 2, 3, 4, 6, 8]

const TYPE_LABEL: Record<string, string> = {
  NORMAL: '正常',
  TYPING: '打字',
  STREAMING: '流式',
  WAITING: '等待',
  KEY_MOMENT: '高光',
  FREEZE: '静止',
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}

/** 单段编辑行：展示时间区间/类型，下拉改倍速，可剪掉（删段=gap，渲染跳过）。 */
export function SegmentRow({
  seg,
  onSpeed,
  onRemove,
}: {
  seg: SegmentView
  onSpeed: (speed: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 tabular-nums text-[var(--color-muted-foreground)]">
        {fmt(seg.start)}–{fmt(seg.end)}
      </span>
      <span className="w-10 shrink-0">{TYPE_LABEL[seg.type] ?? seg.type}</span>
      <select
        value={seg.speed}
        onChange={e => onSpeed(Number(e.target.value))}
        className="rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
      >
        {SPEEDS.map(s => (
          <option key={s} value={s}>{s}x</option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      >
        剪掉
      </button>
    </div>
  )
}
