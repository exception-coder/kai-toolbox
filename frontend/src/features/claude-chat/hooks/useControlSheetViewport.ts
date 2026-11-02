import { useEffect, useState } from 'react'

/** Follow the keyboard's visible area without resizing or scrolling the conversation. */
export function useControlSheetViewport(open: boolean) {
  const read = () => ({ height: window.visualViewport?.height ?? window.innerHeight,
    bottom: Math.max(0, window.innerHeight - (window.visualViewport?.height ?? window.innerHeight) - (window.visualViewport?.offsetTop ?? 0)) })
  const [frame, setFrame] = useState(read)
  useEffect(() => {
    if (!open) return
    const sync = () => setFrame(read())
    sync()
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', sync)
    viewport?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      viewport?.removeEventListener('resize', sync)
      viewport?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [open])
  return frame
}
