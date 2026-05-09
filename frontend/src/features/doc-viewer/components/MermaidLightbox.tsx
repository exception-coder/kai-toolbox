import { useEffect, useRef } from 'react'
import { Maximize2, Minus, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MermaidLightboxProps {
  /** 原 SVG 元素的 outerHTML */
  svgHtml: string
  onClose: () => void
}

export function MermaidLightbox({ svgHtml, onClose }: MermaidLightboxProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const svgWrapRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(1)

  // 注入 SVG（不通过 React 渲染，保证原有标记/字体不被脱节）
  useEffect(() => {
    if (svgWrapRef.current) {
      svgWrapRef.current.innerHTML = svgHtml
      const svg = svgWrapRef.current.querySelector('svg')
      if (svg) {
        svg.removeAttribute('width')
        svg.removeAttribute('height')
        svg.style.width = '100%'
        svg.style.height = 'auto'
        svg.style.maxWidth = 'none'
      }
    }
  }, [svgHtml])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') zoomBy(1.25)
      if (e.key === '-' || e.key === '_') zoomBy(0.8)
      if (e.key === '0') resetZoom()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 滚轮缩放（桌面）
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return // 仅 Ctrl/Cmd + 滚轮缩放，避免和滚动冲突
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? 1.15 : 0.87)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  const applyZoom = () => {
    if (svgWrapRef.current) {
      svgWrapRef.current.style.width = `${zoomRef.current * 100}%`
    }
  }
  const zoomBy = (factor: number) => {
    zoomRef.current = Math.max(0.25, Math.min(8, zoomRef.current * factor))
    applyZoom()
  }
  const resetZoom = () => {
    zoomRef.current = 1
    applyZoom()
  }
  const fitWidth = () => {
    zoomRef.current = 1
    applyZoom()
    if (stageRef.current) stageRef.current.scrollTo({ left: 0, top: 0 })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={e => {
        // 点击背景（非内容）关闭
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-white">
        <div className="text-xs text-white/70">
          滚轮 + Ctrl/Cmd 缩放 · 双指缩放 · 拖动滚动 · ESC 关闭
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15"
            onClick={() => zoomBy(0.8)}
            title="缩小"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15"
            onClick={() => zoomBy(1.25)}
            title="放大"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15"
            onClick={fitWidth}
            title="适配宽度"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15"
            onClick={resetZoom}
            title="重置缩放"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="flex-1 overflow-auto p-4"
        style={{ touchAction: 'pinch-zoom' }}
        onClick={e => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          ref={svgWrapRef}
          className="mx-auto block"
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}
