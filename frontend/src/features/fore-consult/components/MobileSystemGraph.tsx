import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { LocateFixed, Minus, Plus, X, type LucideIcon } from 'lucide-react'
import type { TopoLink } from '../api'
import { fitMobileGraph, mobileGraphEdge, mobileGraphLayout, zoomMobileGraph, type GraphPoint, type GraphView } from '../mobileGraphLayout'
import './mobile-system-graph.css'

export interface MobileGraphSystem { name: string; label: string; category: string; Icon: LucideIcon }
interface Props {
  systems: MobileGraphSystem[]
  links: TopoLink[]
  categories: Array<{ key: string; label: string }>
  category: string | null
  onCategory: (value: string | null) => void
  onConsult: (name: string) => void
  loading: boolean
  error: boolean
  canConsult: boolean
  onRetry: () => void
}

export function MobileSystemGraph({ systems, links, categories, category, onCategory, onConsult, loading, error, canConsult, onRetry }: Props) {
  const surface = useRef<HTMLDivElement>(null)
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>())
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [manualView, setManualView] = useState<GraphView | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const pointers = useRef(new Map<number, GraphPoint>())
  const moved = useRef(false)
  const gestureStart = useRef<GraphPoint | null>(null)
  const arrowId = useId()
  const layout = useMemo(() => mobileGraphLayout(systems.map(s => s.name)), [systems])
  const fitted = fitMobileGraph(layout.bounds, size.width, size.height)
  const view = manualView ?? fitted
  const focused = systems.find(s => s.name === selection)
  const related = links.filter(l => focused && (l.from === focused.name || l.to === focused.name))
  const neighbors = new Set(related.flatMap(l => [l.from, l.to]))
  if (focused) neighbors.add(focused.name)

  useEffect(() => {
    const element = surface.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const closeDetails = () => {
    setSelection(null)
    if (selection) nodeButtons.current.get(selection)?.focus({ preventScroll: true })
  }
  const point = (event: PointerEvent): GraphPoint => {
    const rect = surface.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const next = point(event)
    if (!pointers.current.size) { moved.current = false; gestureStart.current = next }
    pointers.current.set(event.pointerId, next)
    // Capture on the original target so a stationary node tap still produces its click.
    const target = event.target as Element
    target.setPointerCapture(event.pointerId)
    if (pointers.current.size > 1) moved.current = true
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const next = point(event)
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1]
    if (other) {
      const midpoint = (p: GraphPoint) => ({ x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 })
      const distance = (p: GraphPoint) => Math.hypot(p.x - other.x, p.y - other.y)
      setManualView(zoomMobileGraph(view, midpoint(previous), midpoint(next), distance(next) / Math.max(1, distance(previous))))
    } else {
      if (!moved.current && gestureStart.current && Math.hypot(next.x - gestureStart.current.x, next.y - gestureStart.current.y) < 6) return
      moved.current = true
      setManualView({ ...view, x: view.x + next.x - previous.x, y: view.y + next.y - previous.y })
    }
    pointers.current.set(event.pointerId, next)
  }
  const end = (event: PointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId) }
  const zoom = (ratio: number) => {
    const center = { x: size.width / 2, y: size.height / 2 }
    setManualView(zoomMobileGraph(view, center, center, ratio))
  }
  const select = (name: string, keyboard = false) => { if (keyboard || !moved.current) setSelection(name) }
  const label = (name: string) => systems.find(s => s.name === name)?.label ?? name

  return <section className="fc-mobile-map" aria-label="业务系统关系图">
    <header className="fc-mobile-map-toolbar">
      <label><span className="sr-only">筛选业务系统</span><select value={category ?? ''} onChange={event => { onCategory(event.target.value || null); setSelection(null); setManualView(null) }}>
        <option value="">全部系统</option>{categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select></label>
      <span className="fc-mobile-map-count">{systems.length} 个系统 · {links.length} 条关系</span>
      <button type="button" aria-label="定位全图" onClick={() => { setManualView(null); setSelection(null) }}><LocateFixed size={18} /></button>
    </header>
    <div ref={surface} className="fc-mobile-map-canvas" tabIndex={0} aria-label="系统图谱画布，可拖动和双指缩放"
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={event => { moved.current = true; end(event) }} onLostPointerCapture={end}
      onKeyDown={event => {
        if (event.key === 'Escape') closeDetails()
        if (event.target !== event.currentTarget) return
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2) }
        if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2) }
        const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key]
        if (delta) { event.preventDefault(); setManualView({ ...view, x: view.x + delta[0], y: view.y + delta[1] }) }
      }}>
      {loading ? <p className="fc-mobile-map-state" role="status">正在加载系统图谱…</p> : error ? <div className="fc-mobile-map-state" role="alert">系统图谱加载失败<button type="button" onPointerDown={e => e.stopPropagation()} onClick={onRetry}>重新加载</button></div> : !systems.length ? <p className="fc-mobile-map-state">{category ? '当前分类暂无系统，请选择全部系统。' : '暂无已配置的业务系统，请联系管理员。'}</p> : <>
        <div className="fc-mobile-map-world" data-testid="mobile-graph-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg className="fc-mobile-map-lines" overflow="visible" aria-hidden="true">
            <defs><marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
            {links.map((link, index) => {
              const a = layout.positions.get(link.from), b = layout.positions.get(link.to)
              if (!a || !b) return null
              const path = mobileGraphEdge(a, b)
              const highlighted = !focused || link.from === focused.name || link.to === focused.name
              return <g key={index} opacity={highlighted ? 1 : 0.18}>
                <path d={path} className={focused && highlighted ? 'is-focused' : ''} markerEnd={`url(#${arrowId})`} />
                <path d={path} className="fc-mobile-map-edge-hit" onClick={event => select(link.from, event.detail === 0)} />
              </g>
            })}
          </svg>
          <div className="fc-mobile-map-core" aria-label="Forge AI 核心">Forge<span>AI 核心</span></div>
          {systems.map(({ name, label: title, Icon }) => {
            const pos = layout.positions.get(name)!
            return <button type="button" key={name} ref={element => { if (element) nodeButtons.current.set(name, element); else nodeButtons.current.delete(name) }}
              data-system-name={name} className={`fc-mobile-map-node ${focused?.name === name ? 'is-selected' : ''}`} aria-label={title} aria-pressed={focused?.name === name}
              style={{ left: pos.x, top: pos.y, opacity: focused && !neighbors.has(name) ? 0.28 : 1 }}
              onClick={event => select(name, event.detail === 0)}><span className="fc-mobile-map-orb"><Icon size={27} strokeWidth={1.8} /></span><span className="fc-mobile-map-name">{title}</span></button>
          })}
        </div>
      </>}
    </div>
    <div className="fc-mobile-map-zoom" aria-label="图谱缩放"><button type="button" aria-label="放大图谱" onClick={() => zoom(1.2)}><Plus size={18} /></button><button type="button" aria-label="缩小图谱" onClick={() => zoom(1 / 1.2)}><Minus size={18} /></button></div>
    {focused && <section className="fc-mobile-map-details" aria-label={`${focused.label} 的关联关系`} onKeyDown={event => { if (event.key === 'Escape') closeDetails() }}>
      <header><div><h3>{focused.label}</h3><p>关联 {new Set(related.map(l => l.from === focused.name ? l.to : l.from)).size} 个系统</p></div><button type="button" aria-label="关闭系统详情" onClick={closeDetails}><X size={18} /></button></header>
      <ul>{related.length ? related.map((link, index) => <li key={index}><span>{label(link.from)} → {label(link.to)}</span><span>{link.relation}</span></li>) : <li>暂未登记关联关系</li>}</ul>
      <button type="button" className="fc-mobile-map-consult" disabled={!canConsult} onClick={() => onConsult(focused.name)}>咨询此系统</button>
    </section>}
  </section>
}
