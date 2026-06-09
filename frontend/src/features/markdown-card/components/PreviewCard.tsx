import { forwardRef } from 'react'
import { getThemeAttr } from '../lib/themes'
import { RemovableContent } from './RemovableContent'
import type { Theme } from '../types'

interface PreviewCardProps {
  text: string
  theme: Theme
  removed: Set<string>
  onToggleBlock: (key: string) => void
}

export const PreviewCard = forwardRef<HTMLDivElement, PreviewCardProps>(
  ({ text, theme, removed, onToggleBlock }, ref) => {
    return (
      <div ref={ref} {...getThemeAttr(theme)} className="md-card-preview">
        {text.trim() ? (
          <RemovableContent text={text} scope="single" removed={removed} onToggle={onToggleBlock} />
        ) : (
          <div className="md-card-content text-center opacity-60">
            <em>左侧输入 Markdown 后这里会实时预览</em>
          </div>
        )}
      </div>
    )
  },
)
PreviewCard.displayName = 'PreviewCard'
