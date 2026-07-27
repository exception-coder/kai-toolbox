import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Network, X } from 'lucide-react'
import { graphifyGraph } from '@/features/knowledge-graph/api'

// 懒加载 3D 力导图（连带 three.js）——只在打开模态框时才拉这坨大 chunk，不进初始包。
const ForceGraph3D = lazy(() => import('react-force-graph-3d')) as unknown as ComponentType<Record<string, unknown>>

type GNode = { id: string; label: string; group: string | null; community: number | null; communityName: string | null }

/** Graphify 代码结构图（3D 力导图）模态框：读项目 graphify-out/graph.json 渲染。 */
export function GraphifyGraphModal({
  open,
  projectPath,
  projectName,
  onClose,
}: {
  open: boolean
  projectPath: string
  projectName: string
  onClose: () => void
}) {
  const q = useQuery({
    queryKey: ['graphify-graph', projectPath],
    queryFn: () => graphifyGraph(projectPath),
    enabled: open && projectPath.length > 0,
    staleTime: 30_000,
    retry: false,
  })

  // 3D 画布需要显式宽高：测量容器尺寸
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!open) return
    const el = boxRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const spinner = (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
      <Loader2 className="h-4 w-4 animate-spin" />加载 Graphify 图…
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 md:p-6" onClick={onClose}>
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
            <Network className="h-4 w-4 shrink-0" />
            <span className="truncate">Graphify 代码结构图 · {projectName}</span>
            {q.data && (
              <span className="shrink-0 text-xs font-normal text-[var(--color-muted-foreground)]">
                {q.data.truncated ? `渲染 ${q.data.shown} / 共 ${q.data.total} 节点（按度数取核心子图）` : `${q.data.shown} 节点`}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div ref={boxRef} className="relative flex-1 bg-[#0b0f19]">
          {q.isPending ? spinner
            : q.isError ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--color-destructive)]">
                {q.error instanceof Error ? q.error.message : '加载失败'}
              </div>
            ) : q.data && q.data.nodes.length > 0 ? (
              <Suspense fallback={spinner}>
                <ForceGraph3D
                  width={size.w}
                  height={size.h}
                  graphData={{ nodes: q.data.nodes, links: q.data.links }}
                  backgroundColor="#0b0f19"
                  nodeAutoColorBy="community"
                  nodeRelSize={4}
                  nodeLabel={(n: GNode) => `${n.label}${n.communityName ? ` · ${n.communityName}` : ''}`}
                  linkColor={() => 'rgba(160,180,220,0.18)'}
                  linkDirectionalParticles={0}
                  warmupTicks={20}
                  cooldownTicks={120}
                />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">图为空</div>
            )}
        </div>
      </div>
    </div>
  )
}
