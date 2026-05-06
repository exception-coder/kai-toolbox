import { forwardRef, useMemo } from 'react'
import { parseMarkdown } from '../lib/markdownPipeline'
import { getThemeAttr } from '../lib/themes'
import type { Theme } from '../types'

interface PreviewCardProps {
  text: string
  theme: Theme
}

export const PreviewCard = forwardRef<HTMLDivElement, PreviewCardProps>(
  ({ text, theme }, ref) => {
    const html = useMemo(() => parseMarkdown(text), [text])

    return (
      <div ref={ref} {...getThemeAttr(theme)} className="md-card-preview">
        {html ? (
          <div
            className="md-card-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
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
