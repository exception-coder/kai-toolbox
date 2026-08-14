import { useLayoutEffect, useState } from 'react'

interface WindowControlsOverlayLike {
  readonly visible: boolean
  addEventListener(type: 'geometrychange', listener: EventListener): void
  removeEventListener(type: 'geometrychange', listener: EventListener): void
}

type NavigatorWithWindowControlsOverlay = Navigator & {
  windowControlsOverlay?: WindowControlsOverlayLike
}

function getWindowControlsOverlay(): WindowControlsOverlayLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as NavigatorWithWindowControlsOverlay).windowControlsOverlay
}

function isOverlayVisible(overlay = getWindowControlsOverlay()): boolean {
  return overlay?.visible === true
}

function syncDocumentAttribute(visible: boolean): void {
  if (typeof document === 'undefined') return
  if (visible) {
    document.documentElement.dataset.windowControlsOverlay = 'true'
  } else {
    delete document.documentElement.dataset.windowControlsOverlay
  }
}

/**
 * Window Controls Overlay is progressive enhancement: only an installed desktop PWA whose
 * browser reports an actually visible overlay may opt into the unified title bar layout.
 */
export function useWindowControlsOverlay(): boolean {
  const [visible, setVisible] = useState(() => isOverlayVisible())

  useLayoutEffect(() => {
    const overlay = getWindowControlsOverlay()
    const sync = () => {
      const nextVisible = isOverlayVisible(overlay)
      setVisible(nextVisible)
      syncDocumentAttribute(nextVisible)
    }

    sync()
    overlay?.addEventListener('geometrychange', sync)

    return () => {
      overlay?.removeEventListener('geometrychange', sync)
      syncDocumentAttribute(false)
    }
  }, [])

  return visible
}
