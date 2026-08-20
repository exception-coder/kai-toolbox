import { memo, type RefObject } from 'react'

interface RenderedMarkdownRootProps {
  html: string
  className: string
  rootRef: RefObject<HTMLDivElement | null>
}

// Mermaid 会原地改写容器后代；弹框等无关状态变化不能让 React 重写这些节点。
export const RenderedMarkdownRoot = memo(function RenderedMarkdownRoot({
  html,
  className,
  rootRef,
}: RenderedMarkdownRootProps) {
  return (
    <div
      ref={rootRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
