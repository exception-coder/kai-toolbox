import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Bot, ChevronLeft, ChevronRight } from 'lucide-react'
import './assistant-launcher.css'

interface Placement { x: number; y: number; side: 'left' | 'right' | null; collapsed: boolean }
interface Viewport { left: number; top: number; width: number; height: number }
const DEFAULT: Placement = { x: 1, y: 0.45, side: 'right', collapsed: true }
const WIDTH = 76, HEIGHT = 44, TAB_WIDTH = 28, GAP = 12, DRAG_THRESHOLD = 6
const clamp = (value: number, maximum = 1) => Math.min(maximum, Math.max(0, value))
const viewport = (): Viewport => ({
  left: window.visualViewport?.offsetLeft ?? 0, top: window.visualViewport?.offsetTop ?? 0,
  width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight,
})

function restore(key: string): Placement {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null') as Placement | null
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y)
      && typeof value.collapsed === 'boolean' && [null, 'left', 'right'].includes(value.side)) {
      return { x: clamp(value.x), y: clamp(value.y), collapsed: value.collapsed, side: value.side || (value.collapsed ? (value.x < 0.5 ? 'left' : 'right') : null) }
    }
  } catch { /* Browser storage can be unavailable; the launcher remains usable in memory. */ }
  return DEFAULT
}

/** Local presentation only: moving or docking never changes the assistant session or task. */
export function AssistantLauncher({ userId, suspended, onLaunch }: { userId: number; suspended: boolean; onLaunch: () => void }) {
  const key = `forge:work-assistants:launcher:${userId}:v1`
  const [placement, setPlacement] = useState(() => restore(key))
  const [bounds, setBounds] = useState(viewport)
  const [dragging, setDragging] = useState(false)
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null)
  const help = useId()
  const latest = useRef(placement), skipClick = useRef(false)
  const drag = useRef<{ id: number; x: number; y: number; offsetX: number; offsetY: number; original: Placement; moved: boolean } | null>(null)
  const commit = (next: Placement, persist = true) => {
    latest.current = next; setPlacement(next)
    if (persist) try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep the current in-memory position. */ }
  }
  useEffect(() => {
    const sync = () => setBounds(viewport())
    const visible = window.visualViewport
    sync()
    window.addEventListener('resize', sync)
    visible?.addEventListener('resize', sync); visible?.addEventListener('scroll', sync)
    return () => { window.removeEventListener('resize', sync); visible?.removeEventListener('resize', sync); visible?.removeEventListener('scroll', sync) }
  }, [])
  const safe = () => {
    const style = root.current ? getComputedStyle(root.current) : null
    const inset = (edge: string) => Math.max(0, Number.parseFloat(style?.getPropertyValue(`--wa-safe-${edge}`) || '') || 0)
    return { left: inset('left'), right: inset('right'), top: inset('top'), bottom: inset('bottom') }
  }
  const geometry = (value: Placement, frame = bounds) => {
    const inset = safe(), width = value.collapsed ? TAB_WIDTH : WIDTH
    const horizontal = Math.max(0, frame.width - inset.left - inset.right - width - GAP * 2)
    const vertical = Math.max(0, frame.height - inset.top - inset.bottom - HEIGHT - GAP * 2)
    const x = value.collapsed
      ? value.side === 'left' ? inset.left : Math.max(inset.left, frame.width - inset.right - width)
      : inset.left + GAP + (value.side ? (value.side === 'left' ? 0 : 1) : value.x) * horizontal
    return { left: frame.left + x, top: frame.top + inset.top + GAP + value.y * vertical, horizontal, vertical, inset }
  }
  const collapse = () => {
    const current = latest.current
    commit({ ...current, side: current.side || (current.x < 0.5 ? 'left' : 'right'), collapsed: true })
    button.current?.focus({ preventScroll: true })
  }
  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false || drag.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, original: latest.current, moved: false }
    skipClick.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = drag.current
    if (!gesture || gesture.id !== event.pointerId) return
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < DRAG_THRESHOLD) return
    gesture.moved = true; skipClick.current = true; setDragging(true)
    const frame = viewport(), box = geometry({ ...latest.current, collapsed: false, side: null }, frame)
    commit({ x: clamp((event.clientX - gesture.offsetX - frame.left - box.inset.left - GAP) / Math.max(1, box.horizontal)),
      y: clamp((event.clientY - gesture.offsetY - frame.top - box.inset.top - GAP) / Math.max(1, box.vertical)),
      side: null, collapsed: false }, false)
  }
  const finish = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const gesture = drag.current
    if (!gesture || gesture.id !== event.pointerId) return
    drag.current = null; setDragging(false)
    if (cancelled) { skipClick.current = true; commit(gesture.original) }
    else if (gesture.moved) {
      const current = latest.current, box = geometry(current, viewport())
      const nearLeft = current.x * box.horizontal <= TAB_WIDTH
      const nearRight = (1 - current.x) * box.horizontal <= TAB_WIDTH
      commit({ ...current, side: nearLeft ? 'left' : nearRight ? 'right' : null, collapsed: nearLeft || nearRight })
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const box = geometry(placement)
  return <div ref={root} role="toolbar" aria-label="工作助理快捷入口" hidden={suspended}
    className={`wa-launcher${placement.collapsed ? ' is-collapsed' : ''}${dragging ? ' is-dragging' : ''}`}
    data-side={placement.side || 'floating'} style={{ left: box.left, top: box.top }}>
    <p id={help} className="sr-only">拖动可移动，靠近左右边缘会收起。方向键移动，Escape 收起，Home 恢复默认位置。</p>
    <button ref={button} type="button" className="wa-launcher-main" aria-describedby={help}
      aria-label={placement.collapsed ? '展开工作助理' : '唤醒工作助理'} aria-keyshortcuts="Alt+Shift+A"
      title={placement.collapsed ? '工作助理 · 点击展开，也可拖出边缘' : '工作助理 · 拖动可移动，Esc 收起'}
      onPointerDown={down} onPointerMove={move} onPointerUp={event => { move(event); finish(event) }}
      onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
      onClick={event => {
        const suppress = skipClick.current && event.detail !== 0
        skipClick.current = false
        if (suppress) return
        if (latest.current.collapsed) commit({ ...latest.current, collapsed: false })
        else onLaunch()
      }} onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (drag.current && event.key !== 'Escape') return
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation()
          if (drag.current) { const original = drag.current.original; drag.current = null; setDragging(false); skipClick.current = true; commit(original) }
          else collapse()
        } else if (event.key === 'Home') { event.preventDefault(); commit(DEFAULT) }
        else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault()
          const current = latest.current, rect = geometry({ ...current, collapsed: false })
          const horizontal = event.key === 'ArrowLeft' ? -32 : event.key === 'ArrowRight' ? 32 : 0
          const vertical = event.key === 'ArrowUp' ? -32 : event.key === 'ArrowDown' ? 32 : 0
          const x = current.side ? current.side === 'left' ? 0 : 1 : current.x
          commit({ x: clamp(x + horizontal / Math.max(1, rect.horizontal)), y: clamp(current.y + vertical / Math.max(1, rect.vertical)), collapsed: false, side: null })
        }
      }}><Bot aria-hidden="true" /></button>
    {!placement.collapsed && <button type="button" className="wa-launcher-collapse" onClick={collapse} aria-label="收起工作助理" title="收到最近的屏幕边缘">
      {(placement.side || (placement.x < 0.5 ? 'left' : 'right')) === 'left' ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </button>}
  </div>
}
