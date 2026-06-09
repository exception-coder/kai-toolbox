import { useMemo } from 'react'
import { X } from 'lucide-react'
import { lexBlocks, parseMarkdown } from '../lib/markdownPipeline'

interface Props {
  /** 该卡/页的 markdown 原文 */
  text: string
  /** 作用域，用于拼 removed key：'single'（preview/小红书）或 'slide{N}'（幻灯第 N 页） */
  scope: string
  /** 已删块集合，key = `${scope}:${blockIndex}` */
  removed: Set<string>
  onToggle: (key: string) => void
  /** 外层内容类名，默认 md-card-content（主题样式挂在它上） */
  className?: string
}

/**
 * 按顶层块渲染 markdown，每块 hover 出 ✕ 可移除（视图级，不改源文本）。
 * 被移除的块不进 DOM，导出（html-to-image）自然不含。
 */
export function RemovableContent({ text, scope, removed, onToggle, className = 'md-card-content' }: Props) {
  const blocks = useMemo(() => lexBlocks(text), [text])

  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const key = `${scope}:${i}`
        if (removed.has(key)) return null
        return (
          <div key={key} className="md-card-block">
            <div dangerouslySetInnerHTML={{ __html: parseMarkdown(b.raw) }} />
            <button
              type="button"
              className="md-card-block-del"
              aria-label="从卡片移除该段"
              title="从卡片移除该段（可恢复，不改源文本）"
              onClick={() => onToggle(key)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
