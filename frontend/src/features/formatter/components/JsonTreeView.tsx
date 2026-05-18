import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'
import { cn } from '@/lib/utils'
import { LAYOUT_CONSTS, pathOf, type FlowResult, type JsonNodeData } from '../lib/jsonToFlow'

interface JsonTreeViewProps {
  result: FlowResult
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
  /** 点击行 key 时回调；用于跨视图跳转到输出编辑器中对应位置。 */
  onJump?: (path: string) => void
  /** 搜索命中的全部 row 全路径集合，节点内对应行加 soft 高亮。 */
  matchedPaths?: ReadonlySet<string>
  /** 当前聚焦的那一条匹配 row 全路径，加 strong 高亮。 */
  currentMatchPath?: string
  /** 居中目标：节点 id + version。version 变化即触发一次居中（同 id 多次也能触发）。 */
  centerOn?: { nodeId: string; version: number } | null
  className?: string
}

const { NODE_HEADER, NODE_PADDING, ROW_HEIGHT, NODE_VISUAL_MAX_HEIGHT } = LAYOUT_CONSTS

/** 通过 React Context 把交互状态透到自定义节点里，避免靠 node.data 传函数引用。 */
const TreeContext = createContext<{
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
  onJump?: (path: string) => void
  matchedPaths?: ReadonlySet<string>
  currentMatchPath?: string
}>({ expanded: new Set(), onToggle: () => {} })

const JsonNode = memo(function JsonNode({ id, data }: NodeProps<Node<JsonNodeData>>) {
  const { expanded, onToggle, onJump, matchedPaths, currentMatchPath } = useContext(TreeContext)
  const updateNodeInternals = useUpdateNodeInternals()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // 节点内部 row 区可滚动；滚动时让 React Flow 重测 Handle 位置，让连线跟着对齐。
  // rAF 节流避免每帧调度。
  const rafRef = useRef<number | null>(null)
  const handleScroll = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      updateNodeInternals(id)
    })
  }, [id, updateNodeInternals])

  // 行区可用高度 = 节点视觉上限 - header
  const rowsViewportHeight = NODE_VISUAL_MAX_HEIGHT - NODE_HEADER
  // 行总高度（不出滚动时实际占据），用来决定是否需要 overflow
  const rowsContentHeight = data.rows.length * ROW_HEIGHT + NODE_PADDING * 2
  const needsScroll = rowsContentHeight > rowsViewportHeight

  return (
    <div
      className="rounded-md border bg-[var(--color-card)] font-mono text-[11px] shadow-sm"
      style={{ width: LAYOUT_CONSTS.NODE_WIDTH }}
    >
      <div
        className="flex items-center justify-between border-b px-3"
        style={{ height: NODE_HEADER }}
      >
        <span className="text-[var(--color-muted-foreground)]">{data.title}</span>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)] opacity-60">
          {data.isArray ? 'array' : 'object'}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={needsScroll ? handleScroll : undefined}
        className={cn('relative', needsScroll && 'overflow-y-auto')}
        style={{
          maxHeight: rowsViewportHeight,
          padding: NODE_PADDING,
        }}
      >
        {data.rows.map((row, i) => {
          // Handle 的 top 用「行在 padding 内的中线」来定位；节点内滚动时整个 padding 容器一起滚，
          // Handle 也跟着滚 → onScroll 触发 updateNodeInternals 让 React Flow 重新拉取 bounding rect。
          const handleTop = i * ROW_HEIGHT + ROW_HEIGHT / 2
          const isExpanded = row.child ? expanded.has(row.child.id) : false
          const isTruncated = row.rowId === 'r_truncated'
          // 行的全路径：父节点 id + row.key（用 PATH_SEP 连接）。
          // truncated 占位行没有真实 key，跳过高亮判断。
          const rowFullPath = !isTruncated ? pathOf(id, row.key) : ''
          const isMatched = !isTruncated && matchedPaths?.has(rowFullPath)
          const isCurrent = !isTruncated && currentMatchPath === rowFullPath
          return (
            <div
              key={row.rowId}
              className={cn(
                '-mx-1 flex items-center gap-2 rounded px-1',
                isTruncated && 'italic text-[var(--color-muted-foreground)]',
                isCurrent
                  ? 'bg-amber-400/40 dark:bg-amber-400/30'
                  : isMatched && 'bg-amber-200/40 dark:bg-amber-300/15',
              )}
              style={{ height: ROW_HEIGHT }}
            >
              {row.child ? (
                <button
                  type="button"
                  onClick={() => onToggle(row.child!.id)}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
                  title={isExpanded ? '收起' : '展开'}
                >
                  {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                </button>
              ) : (
                <span className="inline-block h-4 w-4 shrink-0" />
              )}
              {isTruncated || !onJump ? (
                <span className="min-w-0 flex-1 truncate text-[var(--color-foreground)]">{row.key}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onJump(pathOf(id, row.key))}
                  title="跳到文本视图对应行"
                  className="min-w-0 flex-1 truncate text-left text-[var(--color-foreground)] hover:text-[var(--color-primary)] hover:underline"
                >
                  {row.key}
                </button>
              )}
              {row.primitive && !isTruncated ? (
                <span
                  className={cn(
                    'min-w-0 max-w-[60%] truncate text-right',
                    row.primitive.kind === 'string' && 'text-emerald-600 dark:text-emerald-400',
                    row.primitive.kind === 'number' && 'text-sky-600 dark:text-sky-400',
                    row.primitive.kind === 'boolean' && 'text-amber-600 dark:text-amber-400',
                    row.primitive.kind === 'null' && 'text-[var(--color-muted-foreground)]',
                  )}
                >
                  {row.primitive.text}
                </span>
              ) : row.child ? (
                <span className="text-[var(--color-muted-foreground)]">{row.child.summary}</span>
              ) : null}
              {row.child && isExpanded && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={row.rowId}
                  style={{ top: handleTop, background: 'var(--color-muted-foreground)' }}
                />
              )}
            </div>
          )
        })}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: 'var(--color-muted-foreground)' }}
      />
    </div>
  )
})

const nodeTypes = { jsonNode: JsonNode }

/** 必须放在 ReactFlow 内部，才能调用 useReactFlow().setCenter 居中视口。
 *  centerOn.version 每次变化都重新居中（同 nodeId 重复跳也生效）。 */
function CenterOnEffect({
  centerOn,
  nodes,
}: {
  centerOn: JsonTreeViewProps['centerOn']
  nodes: Node<JsonNodeData>[]
}) {
  const { setCenter } = useReactFlow()
  // 节点 list 引用变了不必重跑——仅 centerOn.version 触发；用 ref 避免捕获过期 nodes
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  useEffect(() => {
    if (!centerOn?.nodeId) return
    // 等下一帧，让 expand 之后的新节点先完成布局
    const handle = window.requestAnimationFrame(() => {
      const n = nodesRef.current.find(x => x.id === centerOn.nodeId)
      if (!n) return
      const w = n.width ?? 320
      const h = n.height ?? 200
      setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 1, duration: 200 })
    })
    return () => window.cancelAnimationFrame(handle)
  }, [centerOn, setCenter])
  return null
}

export function JsonTreeView({
  result,
  expanded,
  onToggle,
  onJump,
  matchedPaths,
  currentMatchPath,
  centerOn,
  className,
}: JsonTreeViewProps) {
  const dark = useIsDarkTheme()

  const nodes: Node<JsonNodeData>[] = useMemo(
    () =>
      result.nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
        width: n.width,
        height: n.height,
      })),
    [result.nodes],
  )

  const edges: Edge[] = useMemo(
    () =>
      result.edges.map(e => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: 'in',
        type: 'smoothstep',
        style: { stroke: 'var(--color-muted-foreground)', strokeWidth: 1 },
      })),
    [result.edges],
  )

  const ctxValue = useMemo(
    () => ({ expanded, onToggle, onJump, matchedPaths, currentMatchPath }),
    [expanded, onToggle, onJump, matchedPaths, currentMatchPath],
  )

  return (
    <div className={cn('h-full w-full rounded-md border bg-[var(--color-muted)]', className)}>
      <TreeContext.Provider value={ctxValue}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={dark ? 'dark' : 'light'}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.1)" />
          <CenterOnEffect centerOn={centerOn} nodes={nodes} />
        </ReactFlow>
      </TreeContext.Provider>
    </div>
  )
}
