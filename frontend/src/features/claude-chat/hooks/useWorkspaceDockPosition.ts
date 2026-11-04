import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

type Position = { edge: 'left' | 'right'; ratio: number; xRatio?: number }
const WIDTH = 44, HEIGHT = 44, GAP = 12
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high))

/** Persist user placement, but project it into the current viewport and outside the composer. */
export function useWorkspaceDockPosition(userId: number | string, defaultRatio = 0.62) {
  const key = `forge:workspace-dock:${userId}`
  const [position, setPosition] = useState<Position>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (saved && ['left', 'right'].includes(saved.edge) && Number.isFinite(saved.ratio)) {
        return { edge: saved.edge, ratio: clamp(saved.ratio, 0, 1), xRatio: Number.isFinite(saved.xRatio) ? clamp(saved.xRatio, 0, 1) : undefined }
      }
    } catch { /* Storage restrictions must not prevent access to the workspace. */ }
    return { edge: 'right', ratio: defaultRatio }
  })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [revision, update] = useState(0)
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null)
  const gesture = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [safe, setSafe] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  useEffect(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
    document.body.append(probe)
    const sync = () => {
      const style = getComputedStyle(probe)
      setSafe({ top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
        bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 })
      update(value => value + 1)
    }
    sync()
    const viewport = window.visualViewport
    window.addEventListener('resize', sync)
    window.addEventListener('focusin', sync)
    window.addEventListener('focusout', sync)
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    document.querySelectorAll('[data-chat-composer]').forEach(element => observer?.observe(element))
    return () => {
      probe.remove(); observer?.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('focusin', sync)
      window.removeEventListener('focusout', sync)
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
    }
  }, [])
  // Re-read geometry on resize/focus without persisting keyboard-induced displacement.
  void revision
  const viewport = window.visualViewport
  const left = (viewport?.offsetLeft ?? 0) + safe.left + GAP
  const right = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - safe.right - WIDTH - GAP
  const visibleHeight = viewport?.height ?? window.innerHeight
  const minY = (viewport?.offsetTop ?? 0) + Math.min(safe.top + 64, Math.max(GAP, visibleHeight - HEIGHT - GAP))
  let maxY = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - safe.bottom - GAP - HEIGHT
  // Reserve the bottom controls even outside the main conversation; visible composers refine this bound.
  maxY = Math.min(maxY, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 160)
  document.querySelectorAll('[data-chat-composer]').forEach(element => {
    const box = element.getBoundingClientRect()
    if (box.width > 0 && box.height > 0 && box.top > minY) maxY = Math.min(maxY, box.top - HEIGHT - GAP)
  })
  const top = clamp(minY + position.ratio * (maxY - minY), minY, maxY)
  const x = clamp(left + (position.xRatio ?? (position.edge === 'left' ? 0 : 1)) * (right - left), left, right)
  const save = (next: Position) => {
    setPosition(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep session-only placement. */ }
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY
    if (!current.moved && Math.hypot(dx, dy) < 8) return
    current.moved = true
    current.x = clamp(current.originX + dx, left, right)
    current.y = clamp(current.originY + dy, minY, maxY)
    setDragPoint({ x: current.x, y: current.y })
  }
  const settle = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    gesture.current = null
    suppressClick.current = current.moved || cancelled
    if (current.moved && !cancelled) {
      save({ xRatio: right > left ? (current.x - left) / (right - left) : 0, edge: current.x + WIDTH / 2 < (left + right + WIDTH) / 2 ? 'left' : 'right',
        ratio: maxY > minY ? clamp((current.y - minY) / (maxY - minY), 0, 1) : 0 })
    }
    setDragPoint(null)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    buttonRef, edge: position.edge, visibleHeight,
    bottomInset: Math.max(0, window.innerHeight - (viewport?.offsetTop ?? 0) - visibleHeight),
    style: { left: dragPoint?.x ?? x, top: dragPoint?.y ?? top },
    consumeDragClick: () => { const consumed = suppressClick.current; suppressClick.current = false; return consumed },
    pointerHandlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || event.isPrimary === false || gesture.current) return
        suppressClick.current = false
        gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: x, originY: top, x, y: top, moved: false }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      },
      onPointerMove: move,
      // Like the work assistant, account for the final sample even if move events were coalesced.
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => { move(event); settle(event) },
      onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => settle(event, true),
      onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.target === event.currentTarget && gesture.current) settle(event, true)
      },
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false
      if (!event.altKey) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); save({ ...position, xRatio: clamp((position.xRatio ?? (position.edge === 'left' ? 0 : 1)) + (event.key === 'ArrowLeft' ? -0.1 : 0.1), 0, 1), edge: event.key === 'ArrowLeft' ? 'left' : 'right' })
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); save({ ...position, ratio: clamp(position.ratio + (event.key === 'ArrowUp' ? -0.1 : 0.1), 0, 1) })
      }
    },
  }
}
