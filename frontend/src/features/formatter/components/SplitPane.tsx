import type { ReactNode, RefObject } from 'react'

interface SplitPaneProps {
  ratio: number
  containerRef: RefObject<HTMLDivElement | null>
  onSplitterPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onSplitterDoubleClick?: () => void
  left: ReactNode
  right: ReactNode
}

/** 左右分栏 + 中间拖拽手柄的展示型容器。
 *  - lg 及以上横向：左侧 flexBasis = ratio*100%，右侧 flex-1 自动吃剩余空间。
 *  - 窄屏走 flex-col 上下堆叠，手柄 hidden。 */
export function SplitPane({
  ratio,
  containerRef,
  onSplitterPointerDown,
  onSplitterDoubleClick,
  left,
  right,
}: SplitPaneProps) {
  return (
    <div ref={containerRef} className="flex flex-col gap-4 lg:flex-row lg:gap-0">
      <div className="min-w-0 space-y-1.5 lg:shrink-0 lg:pr-2" style={{ flexBasis: `${ratio * 100}%` }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整左右宽度"
        title="拖动调整左右宽度（双击复位）"
        onPointerDown={onSplitterPointerDown}
        onDoubleClick={onSplitterDoubleClick}
        className="group hidden shrink-0 cursor-col-resize select-none items-center justify-center px-1 lg:flex"
        style={{ touchAction: 'none' }}
      >
        <div className="h-16 w-0.5 rounded bg-[var(--color-border)] transition-colors group-hover:bg-[var(--color-primary)]" />
      </div>
      <div className="min-w-0 space-y-1.5 lg:flex-1 lg:pl-2">{right}</div>
    </div>
  )
}
