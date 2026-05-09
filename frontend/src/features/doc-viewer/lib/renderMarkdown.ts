import { marked, type RendererObject } from 'marked'
import DOMPurify from 'dompurify'
import { rewriteRelativeLinks, type RewriteContext } from './rewriteRelativeLinks'

/**
 * 自定义 renderer：把 ```mermaid 代码块直接渲染成专属 `<div>` 占位元素，
 * 由 mermaidRenderer.replaceMermaidBlocks 在 mount 后替换为 SVG。
 *
 * 直接靠占位 class 而非 `language-mermaid`，避免 sanitize 阶段对 class 属性的
 * 不确定处理把识别标记剥掉。
 */
const customRenderer: RendererObject = {
  code({ text, lang }) {
    if (lang === 'mermaid') {
      return `<div class="doc-viewer-mermaid-pending">${escapeHtml(text)}</div>\n`
    }
    const langClass = lang ? ` class="language-${escapeAttr(lang)}"` : ''
    return `<pre><code${langClass}>${escapeHtml(text)}</code></pre>\n`
  },
}

marked.use({ renderer: customRenderer, gfm: true, breaks: false })

/**
 * 渲染 markdown → 安全 HTML，并把相对链接重写到 raw URL / 应用内路由。
 * 不在此处处理 mermaid（mermaid 渲染需要在 DOM 挂载后做，见 mermaidRenderer.replaceMermaidBlocks）。
 */
export function renderMarkdownToHtml(text: string, ctx: RewriteContext): string {
  if (!text || !text.trim()) return ''
  try {
    const raw = marked.parse(text, { async: false }) as string
    const sanitized = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target', 'class'],
    })
    return rewriteRelativeLinks(sanitized, ctx)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `<pre class="doc-viewer-render-error">渲染失败：${escapeHtml(msg)}</pre>`
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

function escapeAttr(s: string): string {
  return s.replace(/[<>"]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))
}
