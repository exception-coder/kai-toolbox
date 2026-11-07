import { Marked } from 'marked'
import DOMPurify from 'dompurify'

export type MessageCopyFormat = 'readable' | 'rich' | 'markdown'
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const parser = new Marked({ gfm: true, renderer: {
  image: ({ text, href }) => escape(`图片：${text || '未命名'}（${href}）`),
  checkbox: ({ checked }) => checked ? '☑ ' : '☐ ',
  link({ tokens, href, title }): string {
    const label = this.parser.parseInline(tokens)
    if (/^(javascript|vbscript|data):/i.test(href)) return label
    // Local paths and application schemes remain visible text, never active clipboard links.
    if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^(https?|mailto|tel):/i.test(href)) return `${label}（${escape(href)}）`
    return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''}>${label}</a>`
  },
} })

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  if (node.tagName === 'BR') return '\n'
  const text = Array.from(node.childNodes, inline).join('')
  const href = node.tagName === 'A' ? node.getAttribute('href') : null
  return href && href !== text ? `${text}（${href}）` : text
}

function list(element: Element, depth: number): string {
  const start = Number(element.getAttribute('start') ?? 1)
  return Array.from(element.children).filter(child => child.tagName === 'LI').map((item, index) => {
    const nested = Array.from(item.children).filter(child => ['UL', 'OL'].includes(child.tagName))
    const content = Array.from(item.childNodes).filter(child => !nested.includes(child as Element))
      .map(child => child instanceof Element && child.tagName === 'P' ? inline(child) + '\n' : inline(child)).join('').trim()
    const indent = '  '.repeat(depth)
    const marker = element.tagName === 'OL' ? `${start + index}.` : '•'
    const body = content.split('\n').map((line, lineIndex) => `${indent}${lineIndex ? '  ' : marker + ' '}${line}`).join('\n')
    return [body, ...nested.map(child => list(child, depth + 1))].join('\n')
  }).join('\n')
}

function block(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? ''
  if (!(node instanceof Element)) return ''
  if (/^H[1-6]$/.test(node.tagName)) return `${'  '.repeat(Number(node.tagName[1]) - 1)}【${inline(node)}】`
  if (node.tagName === 'PRE') return node.textContent?.replace(/\n$/, '') ?? ''
  if (node.tagName === 'UL' || node.tagName === 'OL') return list(node, 0)
  if (node.tagName === 'BLOCKQUOTE') return `引用：\n${Array.from(node.childNodes, block).filter(Boolean).join('\n\n')}`
  if (node.tagName === 'TABLE') {
    const headers = Array.from(node.querySelectorAll('thead th'), inline)
    const rows = Array.from(node.querySelectorAll('tbody tr'))
    if (!rows.length) return headers.join(' | ')
    return rows.map(row => Array.from(row.children).map((cell, index) => `${headers[index] ? headers[index] + '：' : ''}${inline(cell)}`).join('；')).join('\n')
  }
  if (node.tagName === 'HR') return '────────'
  if (['DIV', 'SECTION', 'DETAILS'].includes(node.tagName)) return Array.from(node.childNodes, block).filter(Boolean).join('\n\n')
  return inline(node).trim()
}

/** Export from the complete source, not the folded/virtualized message DOM; never fetch linked resources. */
export function formatMessageCopy(markdown: string): { text: string; html: string } {
  const html = DOMPurify.sanitize(parser.parse(markdown, { async: false }) as string, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 's', 'del', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'hr', 'div', 'section', 'details', 'summary'],
    ALLOWED_ATTR: ['href', 'title', 'start'],
    ALLOW_DATA_ATTR: false,
  })
  const container = document.createElement('div')
  container.innerHTML = html
  const text = Array.from(container.childNodes, block).filter(Boolean).join('\n\n').trim()
  for (const cell of container.querySelectorAll<HTMLElement>('th,td')) cell.style.cssText = 'border:1px solid #b8b8b8;padding:6px 10px;text-align:left'
  for (const table of container.querySelectorAll<HTMLElement>('table')) table.style.cssText = 'border-collapse:collapse;margin:12px 0'
  for (const pre of container.querySelectorAll<HTMLElement>('pre')) pre.style.cssText = 'white-space:pre-wrap;font-family:monospace'
  return { text, html: `<div style="font-family:system-ui,sans-serif;line-height:1.6">${container.innerHTML}</div>` }
}
