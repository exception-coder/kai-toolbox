import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { PreviewCard } from './PreviewCard'
import { XiaohongshuCard } from './XiaohongshuCard'
import { SlideCards, type SlideCardsHandle } from './SlideCards'
import type { Mode, SlideRatio, SplitMode, Theme, Watermark } from '../types'

interface CardRendererProps {
  mode: Mode
  text: string
  theme: Theme
  slideRatio: SlideRatio
  splitMode: SplitMode
  watermark: Watermark
  singleNodeRef: Ref<HTMLDivElement>
  slideHandleRef: Ref<SlideCardsHandle>
  removed: Set<string>
  onToggleBlock: (key: string) => void
}

export function CardRenderer({
  mode,
  text,
  theme,
  slideRatio,
  splitMode,
  watermark,
  singleNodeRef,
  slideHandleRef,
  removed,
  onToggleBlock,
}: CardRendererProps) {
  if (mode === 'xiaohongshu') {
    return (
      <div className="py-4">
        <FitWidth baseWidth={750}>
          <XiaohongshuCard ref={singleNodeRef} text={text} theme={theme} watermark={watermark} removed={removed} onToggleBlock={onToggleBlock} />
        </FitWidth>
      </div>
    )
  }

  if (mode === 'slide') {
    return (
      <div className="py-4">
        <SlideCards ref={slideHandleRef} text={text} theme={theme} ratio={slideRatio} splitMode={splitMode} removed={removed} onToggleBlock={onToggleBlock} />
      </div>
    )
  }

  return (
    <div className="py-4">
      <PreviewCard ref={singleNodeRef} text={text} theme={theme} removed={removed} onToggleBlock={onToggleBlock} />
    </div>
  )
}

/**
 * 把固定宽（如小红书卡 750px）的卡片在窄屏按比例缩小适配，避免移动端超宽/横向滚动。
 * transform 放在外层包裹，导出仍捕获原始尺寸的卡片节点（singleNodeRef），不受缩放影响。
 */
function FitWidth({ baseWidth, maxWidth = 750, children }: { baseWidth: number; maxWidth?: number; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [natH, setNatH] = useState(0)
  useEffect(() => {
    const wrap = wrapRef.current
    const card = cardRef.current
    if (!wrap || !card) return
    const update = () => {
      const avail = Math.min(wrap.clientWidth, maxWidth)
      setScale(Math.min(1, avail / baseWidth))
      setNatH(card.offsetHeight) // transform 不改 offsetHeight，取的是原始高度
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    ro.observe(card)
    return () => ro.disconnect()
  }, [baseWidth, maxWidth])
  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <div style={{ width: baseWidth * scale, height: natH ? natH * scale : undefined }}>
        <div ref={cardRef} className="origin-top-left" style={{ width: baseWidth, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  )
}
