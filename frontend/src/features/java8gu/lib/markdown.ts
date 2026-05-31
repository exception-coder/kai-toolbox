// 题目详情页的 Markdown 渲染：基于 marked + DOMPurify
// 与 doc-viewer 共用思路但参数更紧凑（八股文不渲染 mermaid，相对链接也不需要重写）

import { marked, type Token } from 'marked'

marked.use({ gfm: true, breaks: false })

/** 获取 Markdown AST Tokens */
export function parseMarkdownAST(text: string): Token[] {
  if (!text) return []
  return marked.lexer(text)
}

/** 题目正文同步派生 TOC，避免依赖 index.json 的 headings 字段（保持单一数据源） */
export interface TocItem {
  level: number
  text: string
  id: string
}

export function extractToc(text: string): TocItem[] {
  if (!text) return []
  const items: TocItem[] = []
  // 跳过 fenced code 块里的 # 行
  const lines = text.replace(/```[\s\S]*?```/g, '').split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+?)\s*$/)
    if (!m) continue
    const level = m[1].length
    const raw = m[2].trim()
    const id = `j8-h-${level}-${hashSlug(raw)}`
    items.push({ level, text: raw, id })
  }
  return items
}

export function hashSlug(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}
