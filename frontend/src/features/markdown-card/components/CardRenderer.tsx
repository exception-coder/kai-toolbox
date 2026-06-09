import type { Ref } from 'react'
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
      <div className="flex justify-center overflow-x-auto py-4">
        <XiaohongshuCard ref={singleNodeRef} text={text} theme={theme} watermark={watermark} removed={removed} onToggleBlock={onToggleBlock} />
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
