import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type MutableRefObject, type ReactNode,
} from 'react'

interface VirtualLogProps {
  /** 总行数（父层已按级别过滤后的行数）。 */
  count: number
  /** 固定行高（px）。定高才能做到 O(可视窗口) 的窗口化——每行强制单行（no-wrap + 横向滚动）。 */
  rowHeight: number
  /** 渲染第 index 行的内容（返回内联内容，定位/行高由本组件包裹）。 */
  renderRow: (index: number) => ReactNode
  /**
   * 是否吸底：父层共享的 ref（inline / 放大浮层共用一份）。
   * 用户往上翻看历史时置 false，本组件据此决定新日志到来是否自动滚到底。
   */
  pinnedRef: MutableRefObject<boolean>
  /** 可视窗口上下额外多渲染的行数，抵消快速滚动时的白边。 */
  overscan?: number
  className?: string
  onDoubleClick?: () => void
  title?: string
  /** 无行时展示的占位（如"暂无日志"/"筛选无匹配"）。 */
  empty?: ReactNode
}

/**
 * 轻量定高窗口化日志视图：只把「可视区 + 上下 overscan」这几十行渲染进 DOM，
 * 用上/下两个撑高 spacer 占住其余高度，滚动条与真实全量一致。
 *
 * <p>取代原先「全量 2000 个 div + content-visibility」方案——后者节点全在 DOM 里，
 * 长行 break-all 换行导致 intrinsic-size 与真实高度严重不符，往上翻时触发大面积重排卡顿。
 * 本组件 DOM 节点数恒定（≈可视行数），无论日志 2k 还是 200k 都不卡。</p>
 *
 * <p>代价：每行强制单行不换行，超长行走横向滚动（终端风格）；跨行文本选择只覆盖已渲染的可视行。</p>
 */
export function VirtualLog({
  count, rowHeight, renderRow, pinnedRef,
  overscan = 12, className, onDoubleClick, title, empty,
}: VirtualLogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const rafRef = useRef<number | null>(null)

  // 视口高度：初次测量 + ResizeObserver 跟随（放大/窗口变化时重算窗口）。
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setViewportH(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 吸底时：行数变化 / 行高变化 / 视口变化后滚到底，并同步 scrollTop 让窗口重算到底部。
  useLayoutEffect(() => {
    if (!pinnedRef.current) return
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setScrollTop(el.scrollTop)
  }, [count, rowHeight, viewportH, pinnedRef])

  // 滚动：rAF 节流更新 scrollTop + 维护吸底标记（距底 < 40px 视为吸底）。
  const onScroll = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = ref.current
      if (!el) return
      setScrollTop(el.scrollTop)
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    })
  }, [pinnedRef])

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }, [])

  const total = count * rowHeight
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((scrollTop + viewportH) / rowHeight) + overscan)
  const topPad = start * rowHeight
  const bottomPad = Math.max(0, total - end * rowHeight)

  const rows: ReactNode[] = []
  for (let i = start; i < end; i++) {
    rows.push(
      <div
        key={i}
        style={{ height: rowHeight, lineHeight: `${rowHeight}px`, width: 'max-content', minWidth: '100%' }}
        className="overflow-hidden whitespace-pre"
      >
        {renderRow(i)}
      </div>,
    )
  }

  return (
    <div ref={ref} onScroll={onScroll} onDoubleClick={onDoubleClick} title={title} className={className}>
      {count === 0 ? empty : (
        <>
          <div style={{ height: topPad }} aria-hidden />
          {rows}
          <div style={{ height: bottomPad }} aria-hidden />
        </>
      )}
    </div>
  )
}
