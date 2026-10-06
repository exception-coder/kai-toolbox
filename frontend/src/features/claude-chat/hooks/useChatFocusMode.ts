import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Prefer native fullscreen, with an in-window fallback on unsupported browsers. */
export function useChatFocusMode(root: RefObject<HTMLDivElement | null>, restore: () => void) {
  const [focused, setFocused] = useState(false)
  const owned = useRef(false)
  const active = useRef(false)
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const exit = useCallback(() => {
    if (!active.current) return
    active.current = false
    setFocused(false)
    if (owned.current && document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {})
    owned.current = false
    restoreRef.current()
  }, [root])
  const enter = useCallback(() => {
    active.current = true
    setFocused(true)
    const element = root.current
    if (element?.requestFullscreen && !document.fullscreenElement) {
      void element.requestFullscreen().then(() => {
        if (!active.current) {
          if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {})
          return
        }
        owned.current = true
      }).catch(() => { /* The fixed viewport layout remains usable without native fullscreen. */ })
    }
  }, [root])
  useEffect(() => {
    if (!focused) return
    const siblings = new Map<HTMLElement, boolean>()
    let element: HTMLElement | null = root.current
    while (element?.parentElement) {
      for (const sibling of element.parentElement.children) {
        if (sibling !== element && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) {
          siblings.set(sibling, sibling.inert)
          sibling.inert = true
        }
      }
      element = element.parentElement
      if (element === document.body) break
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"]')) exit()
    }
    const fullscreen = () => { if (owned.current && !document.fullscreenElement) exit() }
    document.addEventListener('keydown', key)
    document.addEventListener('fullscreenchange', fullscreen)
    return () => {
      for (const [sibling, previous] of siblings) sibling.inert = previous
      document.removeEventListener('keydown', key)
      document.removeEventListener('fullscreenchange', fullscreen)
    }
  }, [focused, exit, root])
  useEffect(() => () => {
    active.current = false
    if (owned.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])
  return { focused, enter, exit }
}
