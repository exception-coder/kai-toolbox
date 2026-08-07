import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Maximize2, Minus, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadSvg } from './downloadSvg'

interface MermaidLightboxProps {
  /** 已完成渲染的 Mermaid SVG。 */
  svgHtml: string
  onClose: () => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

/** 为各 Markdown 场景提供一致的 Mermaid 全屏缩放查看能力。 */
export function MermaidLightbox({ svgHtml, onClose }: MermaidLightboxProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const svgWrapRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)

  const zoomBy = useCallback((factor: number) => {
    setZoom(current => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor)))
  }, [])

  const resetView = useCallback(() => {
    setZoom(1)
    stageRef.current?.scrollTo({ left: 0, top: 0 })
  }, [])

  useEffect(() => {
    const wrapper = svgWrapRef.current
    if (!wrapper) return
    wrapper.innerHTML = svgHtml
    const svg = wrapper.querySelector('svg')
    if (!svg) return
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.style.width = '100%'
    svg.style.height = 'auto'
    svg.style.maxWidth = 'none'
  }, [svgHtml])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === '+' || event.key === '=') zoomBy(1.25)
      if (event.key === '-' || event.key === '_') zoomBy(0.8)
      if (event.key === '0') resetView()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, resetView, zoomBy])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomBy(event.deltaY < 0 ? 1.15 : 0.87)
    }
    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [zoomBy])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mermaid 图表全屏查看"
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm"
    >
      <header className="flex min-h-12 items-center justify-between gap-2 border-b border-white/10 px-2 py-1.5 text-white sm:px-3">
        <div className="hidden text-xs text-white/70 sm:block">
          Ctrl/Cmd + 滚轮缩放 · 拖动滚动 · ESC 关闭
        </div>
        <div className="text-xs tabular-nums text-white/70 sm:ml-auto">{Math.round(zoom * 100)}%</div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/15" onClick={() => zoomBy(0.8)} title="缩小" aria-label="缩小图表">
            <Minus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/15" onClick={() => zoomBy(1.25)} title="放大" aria-label="放大图表">
            <Plus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/15" onClick={resetView} title="适应屏幕" aria-label="图表适应屏幕">
            <Maximize2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden text-white hover:bg-white/15 sm:inline-flex" onClick={resetView} title="重置缩放" aria-label="重置图表缩放">
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/15" onClick={() => downloadSvg(svgHtml)} title="导出 SVG 矢量图" aria-label="导出 SVG 矢量图">
            <Download className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/15" onClick={onClose} title="关闭" aria-label="关闭全屏图表">
            <X className="size-5" />
          </Button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="flex-1 overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
      >
        <div
          ref={svgWrapRef}
          className="mx-auto block min-w-0 rounded-lg bg-white p-2 shadow-2xl"
          style={{ width: `${zoom * 100}%` }}
        />
      </div>
    </div>,
    document.body,
  )
}
