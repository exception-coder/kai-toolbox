import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Mobile stays in-window; desktop prefers native fullscreen with the same reversible fallback. */
export function useChatFocusMode(root: RefObject<HTMLDivElement | null>, restore: () => void,
  captureReadingPosition?: () => (() => void) | undefined) {
  const [focused, setFocused] = useState(false)
  const owned = useRef(false)
  const active = useRef(false)
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const captureRef = useRef(captureReadingPosition)
  captureRef.current = captureReadingPosition
  const readingPosition = useRef<(() => void) | undefined>(undefined)
  const exit = useCallback(() => {
    if (!active.current) return
    readingPosition.current = captureRef.current?.()
    active.current = false
    setFocused(false)
    if (owned.current && document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {})
    owned.current = false
    restoreRef.current()
  }, [root])
  const enter = useCallback(() => {
    if (active.current) return
    readingPosition.current = captureRef.current?.()
    active.current = true
    setFocused(true)
    const element = root.current
    // Mobile uses the in-window view so keyboard and embedded H5 viewport changes remain available.
    if (!window.matchMedia?.('(max-width: 767px)').matches && element?.requestFullscreen && !document.fullscreenElement) {
      void element.requestFullscreen().then(() => {
        if (!active.current) {
          if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {})
          return
        }
        owned.current = true
      }).catch(() => { /* The fixed viewport layout remains usable without native fullscreen. */ })
    }
  }, [root])
  useLayoutEffect(() => {
    const position = readingPosition.current
    readingPosition.current = undefined
    if (!position) return
    const frame = requestAnimationFrame(position)
    return () => cancelAnimationFrame(frame)
  }, [focused])
  useLayoutEffect(() => {
    const element = root.current
    if (!focused || !element) return
    const viewport = window.visualViewport
    const update = () => {
      // Do not fight the user's pinch zoom. Desktop and unsupported containers retain the fallback.
      if (viewport && viewport.scale !== 1) return
      element.style.setProperty('--cc-focus-height', `${viewport?.height ?? window.innerHeight}px`)
      element.style.setProperty('--cc-focus-top', `${viewport?.offsetTop ?? 0}px`)
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      element.style.removeProperty('--cc-focus-height')
      element.style.removeProperty('--cc-focus-top')
    }
  }, [focused, root])
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
