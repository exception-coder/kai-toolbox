import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** 左右分栏比例 Hook：拖拽手柄改变比例，并按 storageKey 持久化到 localStorage。
 *  - 范围 [min, max] 钳制，避免任一侧塌成 0。
 *  - 使用 pointer capture，鼠标快速移动也不丢追踪。
 *  - 双击手柄触发 reset() 复位到 initial。 */
export interface UseSplitRatioResult {
  ratio: number
  containerRef: RefObject<HTMLDivElement | null>
  onSplitterPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  reset: () => void
}

export function useSplitRatio(
  storageKey: string,
  initial = 0.5,
  range: [number, number] = [0.2, 0.8],
): UseSplitRatioResult {
  const [min, max] = range
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(storageKey))
      return Number.isFinite(v) && v >= min && v <= max ? v : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(ratio))
    } catch {
      /* 隐私模式 / quota 满，静默 */
    }
  }, [storageKey, ratio])

  const onSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return
      // 窄屏（< 640px）走 flex-col 上下堆叠，不允许拖拽
      if (container.getBoundingClientRect().width < 640) return
      e.preventDefault()
      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)
      const onMove = (ev: PointerEvent) => {
        const rect = container.getBoundingClientRect()
        if (rect.width <= 0) return
        const r = (ev.clientX - rect.left) / rect.width
        setRatio(Math.min(max, Math.max(min, r)))
      }
      const onUp = () => {
        try { handle.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
        handle.removeEventListener('pointercancel', onUp)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
      handle.addEventListener('pointercancel', onUp)
    },
    [min, max],
  )

  const reset = useCallback(() => setRatio(initial), [initial])

  return { ratio, containerRef, onSplitterPointerDown, reset }
}
