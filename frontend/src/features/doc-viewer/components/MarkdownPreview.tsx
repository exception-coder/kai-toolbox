import { useEffect, useRef, useState } from 'react'
import { renderMarkdownToHtml } from '../lib/renderMarkdown'
import { replaceMermaidBlocks } from '../lib/mermaidRenderer'
import type { RewriteContext } from '../lib/rewriteRelativeLinks'
import { MermaidLightbox } from './MermaidLightbox'
import '../styles/markdown.css'

interface MarkdownPreviewProps {
  content: string
  rewriteContext: RewriteContext
  // debounce 上限：本地编辑场景做 150ms 节流避免每个键都解析
  debounceMs?: number
}

// 实时预览：监听 content 变化，节流渲染 + 替换 mermaid 块。
// 与 MarkdownView 的区别：不强制 contentKey 重建，且节流以适配频繁编辑。
export function MarkdownPreview({ content, rewriteContext, debounceMs = 150 }: MarkdownPreviewProps) {
  const [html, setHtml] = useState('')
  const [lightboxSvg, setLightboxSvg] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setHtml(renderMarkdownToHtml(content, rewriteContext))
    }, debounceMs)
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [content, rewriteContext, debounceMs])

  useEffect(() => {
    if (!html) return
    const root = rootRef.current
    if (!root) return
    void replaceMermaidBlocks(root).catch(e => console.warn('mermaid render failed', e))
  }, [html])

  useEffect(() => {
    const root = rootRef.current
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
  }, [html])

  return (
    <>
      <div
        ref={rootRef}
        className="doc-viewer-md h-full overflow-y-auto px-4 py-4 sm:px-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {lightboxSvg && (
        <MermaidLightbox svgHtml={lightboxSvg} onClose={() => setLightboxSvg(null)} />
      )}
    </>
  )
}
