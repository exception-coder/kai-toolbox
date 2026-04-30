import { useState } from 'react'
import { Treemap as RTreemap, ResponsiveContainer } from 'recharts'
import { formatBytes } from '@/lib/utils'
import type { NodeView } from '../types'

interface TreemapProps {
  nodes: NodeView[]
  onNavigate: (node: NodeView) => void
}

interface TreemapDatum {
  name: string
  size: number
  full: NodeView
}

interface HoverInfo {
  x: number
  y: number
  datum: TreemapDatum
}

export function Treemap({ nodes, onNavigate }: TreemapProps) {
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const data: TreemapDatum[] = nodes
    .filter(n => n.size > 0)
    .map(n => ({ name: n.name, size: n.size, full: n }))

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border bg-[var(--color-card)] text-sm text-[var(--color-muted-foreground)]">
        没有可视化的内容
      </div>
    )
  }

  return (
    <div className="relative h-72 overflow-hidden rounded-md border bg-[var(--color-card)]">
      <ResponsiveContainer width="100%" height="100%">
        <RTreemap
          data={data}
          dataKey="size"
          stroke="var(--color-background)"
          fill="var(--color-primary)"
          isAnimationActive={false}
          content={
            <TreemapNode
              onNavigate={onNavigate}
              onHover={setHover}
            />
          }
        />
      </ResponsiveContainer>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-[var(--color-card)] px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(hover.x + 12, 320), top: hover.y + 12 }}
        >
          <div className="font-medium">{hover.datum.name}</div>
          <div className="text-[var(--color-muted-foreground)]">{formatBytes(hover.datum.size)}</div>
        </div>
      )}
    </div>
  )
}

interface TreemapNodeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  name?: string
  payload?: TreemapDatum
  onNavigate: (node: NodeView) => void
  onHover: (info: HoverInfo | null) => void
}

function TreemapNode(props: TreemapNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0, name, payload, onNavigate, onHover } = props
  const showLabel = width > 60 && height > 24
  const intensity = payload ? Math.min(0.85, 0.3 + Math.log10(payload.size + 1) / 12) : 0.3
  const isDir = payload?.full.dir ?? false

  return (
    <g
      style={{ cursor: isDir ? 'pointer' : 'default' }}
      onClick={() => isDir && payload && onNavigate(payload.full)}
      onMouseMove={e => payload && onHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, datum: payload })}
      onMouseLeave={() => onHover(null)}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: `oklch(0.55 0.18 264 / ${intensity})`,
          stroke: 'var(--color-background)',
          strokeWidth: 2,
        }}
      />
      {showLabel && (
        <text
          x={x + 8}
          y={y + 18}
          fill="white"
          fontSize={12}
          fontWeight={500}
          style={{ pointerEvents: 'none' }}
        >
          <tspan>{name}</tspan>
          {height > 40 && payload && (
            <tspan x={x + 8} dy="14" fontSize={11} opacity={0.9}>
              {formatBytes(payload.size)}
            </tspan>
          )}
        </text>
      )}
    </g>
  )
}
