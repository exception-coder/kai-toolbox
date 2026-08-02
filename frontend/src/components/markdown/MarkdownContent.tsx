import { useMemo, type RefObject } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { cn } from '@/lib/utils'
import '@/features/doc-viewer/styles/markdown.css'

interface MarkdownContentProps {
  content: string
  containerRef?: RefObject<HTMLDivElement | null>
  className?: string
}

/**
 * PRD/TDD 等平台文档的统一 Markdown 阅读组件。
 *
 * 统一使用 doc-viewer 的正文排版，并在注入 DOM 前完成 HTML 清洗。调用方只负责
 * 提供滚动容器尺寸，不再各自维护 marked、DOMPurify 和 prose 样式。
 */
export function MarkdownContent({ content, containerRef, className }: MarkdownContentProps) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(content, { async: false }) as string),
    [content],
  )

  return (
    <div ref={containerRef} className={cn('h-full overflow-y-auto p-6', className)}>
      <div
        className="doc-viewer-md max-w-none"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
