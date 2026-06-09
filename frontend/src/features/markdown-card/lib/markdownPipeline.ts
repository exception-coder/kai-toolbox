import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export function parseMarkdown(text: string): string {
  if (!text || !text.trim()) return ''
  try {
    const raw = marked.parse(text, { async: false }) as string
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `<pre class="md-card-error">Markdown 解析失败：${escapeHtml(msg)}</pre>`
  }
}

/**
 * 切顶层块：用 marked.lexer 取顶层 token（段落/标题/列表/代码块/引用/表格…），
 * 过滤 space 与纯空白。供「卡片段落可视删除」按块渲染。lexer 异常时兜底为单块。
 */
export function lexBlocks(text: string): { raw: string }[] {
  if (!text || !text.trim()) return []
  try {
    return marked
      .lexer(text)
      .filter(t => t.type !== 'space' && typeof t.raw === 'string' && t.raw.trim().length > 0)
      .map(t => ({ raw: t.raw }))
  } catch {
    return [{ raw: text }]
  }
}

export function splitSlides(text: string): string[] {
  if (!text) return ['']
  const parts = text.split(/^\s*---\s*$/m)
  const slides = parts.map(p => p.trim()).filter(p => p.length > 0)
  return slides.length > 0 ? slides : ['']
}

/** 按标题行分块：遇到指定级别的标题就开始新的一张卡 */
export function splitByHeading(text: string, maxLevel: 1 | 2): string[] {
  if (!text || !text.trim()) return ['']

  const headingRe = maxLevel === 1 ? /^#\s/ : /^#{1,2}\s/
  const lines = text.split('\n')
  const sections: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (headingRe.test(line) && current.some(l => l.trim())) {
      sections.push(current.join('\n').trim())
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.some(l => l.trim())) {
    sections.push(current.join('\n').trim())
  }

  const result = sections.filter(s => s.length > 0)
  return result.length > 0 ? result : ['']
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
