import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import './consult-panel.css'

const PANEL_GAP = 24
const MIN_WIDTH = 360

/** 咨询窗口在当前工作区内调宽，内容不因展开或还原而重新挂载。 */
export function ConsultPanel({ side, initialWidth, className, children }: {
  side: 'left' | 'right'
  initialWidth: number
  className: string
  children: (controls: ReactNode) => ReactNode
}) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null)
  const [width, setWidth] = useState(initialWidth)
  const [available, setAvailable] = useState(initialWidth)
  const [expanded, setExpanded] = useState(false)
  const min = Math.min(MIN_WIDTH, available)
  const limit = (value: number) => Math.max(min, Math.min(value, available))
  const shownWidth = expanded ? available : limit(width)
  useLayoutEffect(() => {
    const parent = panel.current?.parentElement
    if (!parent) return
    const measure = () => setAvailable(Math.max(0, parent.getBoundingClientRect().width - PANEL_GAP))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  const controls = <button type="button" className="fc-panel-expand" aria-expanded={expanded}
    aria-controls={id} aria-label={expanded ? '还原对话窗口' : '展开对话窗口'}
    title={expanded ? '还原到调整前宽度' : '展开至工作区宽度，便于查看表格'}
    onClick={() => setExpanded(value => !value)}>
    {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
  </button>
  return <div ref={panel} id={id} className={`fc-resizable-panel ${className}`} data-side={side}
    data-expanded={expanded || undefined} style={{ '--fc-panel-width': `${shownWidth}px` } as CSSProperties}
    onClick={event => event.stopPropagation()}>
    {children(controls)}
    {!expanded && <div className="fc-panel-resizer" role="separator" tabIndex={0} aria-label="调整对话窗口宽度"
      aria-orientation="vertical" aria-controls={id} aria-valuemin={min} aria-valuemax={available}
      aria-valuenow={shownWidth} aria-valuetext={`${Math.round(shownWidth)} 像素`}
      title="拖拽调整宽度；左右方向键调节，Home / End 最小 / 最大，双击还原"
      onDoubleClick={() => setWidth(initialWidth)}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, width: shownWidth, pointerId: event.pointerId }
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start || start.pointerId !== event.pointerId) return
        setWidth(limit(start.width + (event.clientX - start.x) * (side === 'left' ? 1 : -1)))
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const direction = (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1)
        setWidth(event.key === 'Home' ? min : event.key === 'End' ? available : limit(shownWidth + direction * (event.shiftKey ? 96 : 32)))
      }} />}
  </div>
}

/** 表格保持原生语义，同时允许键盘聚焦其横向滚动区域。 */
export function ConsultAnswerContent({ text, children }: { text: string; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = content.current
    if (!element) return
    const prepareTables = () => element.querySelectorAll('table').forEach((table, index) => {
        table.tabIndex = 0
        table.setAttribute('aria-label', `咨询表格 ${index + 1}，可横向滚动`)
      })
    prepareTables()
    const observer = new MutationObserver(prepareTables)
    observer.observe(element, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [text])
  return <div ref={content} className="fc-answer-content">{children}</div>
}
