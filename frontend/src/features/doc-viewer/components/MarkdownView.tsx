import { useEffect, useRef, useState } from 'react'
import { renderMarkdownToHtml } from '../lib/renderMarkdown'
import { replaceMermaidBlocks } from '../lib/mermaidRenderer'
import { shouldShowSkeleton } from '../lib/sizeStrategy'
import type { RewriteContext } from '../lib/rewriteRelativeLinks'
import { MermaidLightbox } from './MermaidLightbox'
import '../styles/markdown.css'

interface MarkdownViewProps {
  content: string
  size: number
  rewriteContext: RewriteContext
  /** 由父级注入；变化时强制重新渲染（即用 path+sha 拼接） */
  contentKey: string
  /** 渲染区根节点引用，供 TocPanel 提取标题 */
  rootRef: React.RefObject<HTMLDivElement | null>
}

export function MarkdownView({ content, size, rewriteContext, contentKey, rootRef }: MarkdownViewProps) {
  const [html, setHtml] = useState<string>('')
  const [rendering, setRendering] = useState(false)
  const [lightboxSvg, setLightboxSvg] = useState<string | null>(null)
  const localRef = useRef<HTMLDivElement | null>(null)
  const showSkeleton = shouldShowSkeleton(size)

  useEffect(() => {
    let cancelled = false
    setRendering(true)
    setHtml('')
    // 让骨架先 paint 一帧，再做重活
    const handle = window.requestAnimationFrame(() => {
      if (cancelled) return
      const result = renderMarkdownToHtml(content, rewriteContext)
      if (cancelled) return
      setHtml(result)
      setRendering(false)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(handle)
    }
  }, [content, rewriteContext, contentKey])

  useEffect(() => {
    if (!html) return
    const root = rootRef.current ?? localRef.current
    if (!root) return
    let cancelled = false
    void replaceMermaidBlocks(root).catch(e => {
      if (!cancelled) console.warn('mermaid render failed', e)
    })
    return () => { cancelled = true }
  }, [html, rootRef])

  // 委托：点击 mermaid 图打开 Lightbox
  useEffect(() => {
    const root = rootRef.current ?? localRef.current
    if (!root) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const wrap = target.closest('.doc-viewer-mermaid')
      if (!wrap) return
      const svg = wrap.querySelector('svg')
      if (!svg) return
      e.preventDefault()
      setLightboxSvg(svg.outerHTML)
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html, rootRef])

  if (rendering && showSkeleton) {
    return (
      <div className="space-y-3">
        <div className="text-xs text-[var(--color-muted-foreground)]">
          文件较大（{(size / 1024).toFixed(0)} KB），渲染中…
        </div>
        <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-muted)]/60" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--color-muted)]/60" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-muted)]/60" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--color-muted)]/60" />
      </div>
    )
  }

  return (
    <>
      <div
        ref={node => {
          localRef.current = node
          rootRef.current = node
        }}
        className="doc-viewer-md"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {lightboxSvg && (
        <MermaidLightbox svgHtml={lightboxSvg} onClose={() => setLightboxSvg(null)} />
      )}
    </>
  )
}
