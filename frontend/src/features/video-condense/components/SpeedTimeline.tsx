import type { SegmentView } from '../types'
import { SegmentRow } from './SegmentRow'

/** 倍速越高颜色越暖，直观体现「飞过去 vs 保速」。 */
function speedColor(speed: number): string {
  if (speed <= 1) return '#22c55e'
  if (speed <= 1.5) return '#84cc16'
  if (speed <= 3) return '#eab308'
  if (speed <= 6) return '#f97316'
  return '#ef4444'
}

/** 速度曲线可视化 + 逐段微调。条宽 = 段时长占比；删段在时间轴留 gap，渲染时剔除。 */
export function SpeedTimeline({
  segments,
  duration,
  onChange,
}: {
  segments: SegmentView[]
  duration: number
  onChange: (segments: SegmentView[]) => void
}) {
  const total = duration > 0 ? duration : segments.reduce((m, s) => Math.max(m, s.end), 0) || 1
  const setSpeed = (i: number, speed: number) =>
    onChange(segments.map((s, j) => (j === i ? { ...s, speed } : s)))
  const remove = (i: number) => onChange(segments.filter((_, j) => j !== i))

  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full overflow-hidden rounded-md border bg-[var(--color-muted)]">
        {segments.map((s, i) => (
          <div
            key={i}
            title={`${s.type} · ${s.speed}x`}
            style={{ width: `${((s.end - s.start) / total) * 100}%`, background: speedColor(s.speed) }}
          />
        ))}
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {segments.map((s, i) => (
          <SegmentRow key={i} seg={s} onSpeed={sp => setSpeed(i, sp)} onRemove={() => remove(i)} />
        ))}
      </div>
    </div>
  )
}
