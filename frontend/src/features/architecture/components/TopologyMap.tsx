/**
 * 拓扑图组件：以 SVG 连线 + 绝对定位节点渲染服务依赖图。
 *
 * 设计原则：
 * - 节点位置用 0–100 百分比坐标手工指定（无需 force-layout 库）
 * - SVG 层绘制带箭头的有向边（可标注协议/接口名）
 * - 节点层用 CSS 绝对定位叠加在 SVG 之上
 * - 零新依赖，纯 React/SVG/Tailwind
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/* ── 类型 ── */

export type NodeType = 'ui' | 'api' | 'service' | 'db' | 'external' | 'ai' | 'monitor' | 'cache'

export type TopoNode = {
  id: string
  /** 主标签 */
  label: string
  /** 次级说明（端口号、技术名等） */
  sub?: string
  type: NodeType
  /** 水平位置，0-100（百分比） */
  x: number
  /** 垂直位置，0-100（百分比） */
  y: number
}

export type TopoEdge = {
  from: string
  to: string
  /** 边标签：协议 / 接口 / 数据类型 */
  label?: string
  /** 虚线：表示可选/未来的连接 */
  dashed?: boolean
  /** 双向箭头 */
  bidirectional?: boolean
}

export type TopologyMapProps = {
  title: string
  subtitle?: string
  nodes: TopoNode[]
  edges: TopoEdge[]
  /** 容器高度（px），默认 380 */
  height?: number
}

/* ── 颜色 ── */

const NODE_STYLE: Record<NodeType, { border: string; bg: string; text: string; badge: string }> = {
  ui:       { border: 'border-blue-500/60',    bg: 'bg-blue-500/10',    text: 'text-blue-800 dark:text-blue-200',    badge: 'bg-blue-500/15' },
  api:      { border: 'border-violet-500/60',  bg: 'bg-violet-500/10',  text: 'text-violet-800 dark:text-violet-200', badge: 'bg-violet-500/15' },
  service:  { border: 'border-violet-500/60',  bg: 'bg-violet-500/10',  text: 'text-violet-800 dark:text-violet-200', badge: 'bg-violet-500/15' },
  db:       { border: 'border-rose-500/60',    bg: 'bg-rose-500/10',    text: 'text-rose-800 dark:text-rose-200',    badge: 'bg-rose-500/15' },
  external: { border: 'border-orange-500/60',  bg: 'bg-orange-500/10',  text: 'text-orange-800 dark:text-orange-200', badge: 'bg-orange-500/15' },
  ai:       { border: 'border-emerald-500/60', bg: 'bg-emerald-500/10', text: 'text-emerald-800 dark:text-emerald-200', badge: 'bg-emerald-500/15' },
  monitor:  { border: 'border-slate-500/60',   bg: 'bg-slate-500/10',   text: 'text-slate-700 dark:text-slate-300',  badge: 'bg-slate-500/15' },
  cache:    { border: 'border-amber-500/60',   bg: 'bg-amber-500/10',   text: 'text-amber-800 dark:text-amber-200',  badge: 'bg-amber-500/15' },
}

const TYPE_LABEL: Record<NodeType, string> = {
  ui: '前端', api: 'API', service: '服务', db: '数据库',
  external: '外部', ai: 'AI', monitor: '监控', cache: '缓存',
}

const EDGE_COLOR = 'rgba(148,163,184,0.7)'  // slate-400/70
const EDGE_DASHED_COLOR = 'rgba(148,163,184,0.4)'

/* ── 节点宽高（px），用于计算箭头起止偏移 ── */
const NODE_W = 100  // 估算宽度
const NODE_H = 48   // 估算高度

/* ── 主组件 ── */

export function TopologyMap({ title, subtitle, nodes, edges, height = 380 }: TopologyMapProps) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>{title}</span>
          <Badge variant="outline">拓扑图</Badge>
        </CardTitle>
        {subtitle && <p className="text-xs text-[var(--color-muted-foreground)]">{subtitle}</p>}
      </CardHeader>
      <CardContent className="p-0">
        {/* 图例 */}
        <div className="flex flex-wrap gap-3 border-b px-4 py-2">
          {(Object.entries(TYPE_LABEL) as [NodeType, string][]).filter(([type]) =>
            nodes.some(n => n.type === type),
          ).map(([type, label]) => {
            const s = NODE_STYLE[type]
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span className={cn('h-3 w-3 rounded-sm border', s.border, s.bg)} />
                <span className="text-[11px] text-[var(--color-muted-foreground)]">{label}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5">
            <svg width="24" height="10" className="shrink-0">
              <line x1="2" y1="5" x2="18" y2="5" stroke={EDGE_COLOR} strokeWidth="1.5" markerEnd="url(#legend-arrow)" />
              <defs>
                <marker id="legend-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={EDGE_COLOR} />
                </marker>
              </defs>
            </svg>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">调用关系</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="24" height="10" className="shrink-0">
              <line x1="2" y1="5" x2="18" y2="5" stroke={EDGE_DASHED_COLOR} strokeWidth="1.5" strokeDasharray="3 2" markerEnd="url(#legend-dashed)" />
              <defs>
                <marker id="legend-dashed" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={EDGE_DASHED_COLOR} />
                </marker>
              </defs>
            </svg>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">待接入/可选</span>
          </div>
        </div>

        {/* 拓扑画布 */}
        <div className="relative w-full overflow-x-auto">
          <div className="relative min-w-[560px]" style={{ height }}>
            {/* SVG 边层 */}
            <svg
              className="pointer-events-none absolute inset-0"
              width="100%"
              height="100%"
              style={{ zIndex: 0 }}
            >
              <defs>
                <marker id="topo-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={EDGE_COLOR} />
                </marker>
                <marker id="topo-arrow-back" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
                  <path d="M6,0 L6,6 L0,3 z" fill={EDGE_COLOR} />
                </marker>
                <marker id="topo-arrow-dashed" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={EDGE_DASHED_COLOR} />
                </marker>
              </defs>

              {edges.map((edge, i) => {
                const fromNode = nodeMap[edge.from]
                const toNode = nodeMap[edge.to]
                if (!fromNode || !toNode) return null

                // Center positions in SVG viewport (uses viewBox percentage trick via foreignObject)
                // We use CSS calc to get approximate center positions
                const x1 = fromNode.x
                const y1 = fromNode.y
                const x2 = toNode.x
                const y2 = toNode.y

                const color = edge.dashed ? EDGE_DASHED_COLOR : EDGE_COLOR
                const markerId = edge.dashed ? 'topo-arrow-dashed' : 'topo-arrow'

                // Shorten line slightly to avoid overlapping node boxes
                const dx = x2 - x1
                const dy = y2 - y1
                const len = Math.sqrt(dx * dx + dy * dy)
                const shrink = len > 0 ? 6 / len : 0
                const sx1 = x1 + dx * shrink
                const sy1 = y1 + dy * shrink
                const sx2 = x2 - dx * shrink
                const sy2 = y2 - dy * shrink

                // Midpoint for edge label
                const mx = (sx1 + sx2) / 2
                const my = (sy1 + sy2) / 2
                // Perpendicular offset for label
                const perpX = -dy / len * 3
                const perpY = dx / len * 3

                return (
                  <g key={i}>
                    <line
                      x1={`${sx1}%`} y1={`${sy1}%`}
                      x2={`${sx2}%`} y2={`${sy2}%`}
                      stroke={color}
                      strokeWidth="1.5"
                      strokeDasharray={edge.dashed ? '5 3' : undefined}
                      markerEnd={`url(#${markerId})`}
                      markerStart={edge.bidirectional ? `url(#topo-arrow-back)` : undefined}
                    />
                    {edge.label && (
                      <text
                        x={`${mx + perpX}%`}
                        y={`${my + perpY}%`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="9"
                        fill="rgba(148,163,184,0.9)"
                        className="font-mono select-none"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* 节点层 */}
            {nodes.map(node => {
              const s = NODE_STYLE[node.type]
              return (
                <div
                  key={node.id}
                  className={cn(
                    'absolute flex min-w-[80px] max-w-[120px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5',
                    'rounded-lg border px-2.5 py-1.5 text-center shadow-sm',
                    s.border, s.bg,
                  )}
                  style={{ left: `${node.x}%`, top: `${node.y}%`, zIndex: 1 }}
                >
                  <span className={cn('text-xs font-semibold leading-tight', s.text)}>{node.label}</span>
                  {node.sub && (
                    <span className="text-[10px] leading-tight text-[var(--color-muted-foreground)]">{node.sub}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
