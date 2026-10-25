import { marked } from 'marked'

export type MessageBlock = { kind: 'text'; content: string } | { kind: 'mermaid'; code: string } | { kind: 'site-preview'; code: string }

/** Only complete, top-level fenced blocks become interactive; examples inside a larger fence stay code. */
export function splitMessageBlocks(text: string): MessageBlock[] {
  if (!/(?:^|\n) {0,3}(?:`{3,}|~{3,})(?:mermaid|site-preview)[ \t]*(?:\r?\n|$)/.test(text)) {
    return text ? [{ kind: 'text', content: text }] : []
  }
  // Marked normalizes CRLF before tokenization; use the same offsets when slicing.
  text = text.replace(/\r\n?/g, '\n')
  const blocks: MessageBlock[] = []
  let offset = 0
  let last = 0
  for (const token of marked.lexer(text)) {
    const start = text.indexOf(token.raw, offset)
    if (start < 0) continue
    offset = start + token.raw.length
    if (token.type !== 'code' || (token.lang !== 'mermaid' && token.lang !== 'site-preview')) continue
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(token.raw)?.[1]
    if (!fence || !new RegExp(`\\n {0,3}${fence[0]}{${fence.length},}[ \\t]*(?:\\r?\\n)?$`).test(token.raw)) continue
    if (start > last) blocks.push({ kind: 'text', content: text.slice(last, start) })
    blocks.push({ kind: token.lang, code: token.text.trim() })
    last = offset
  }
  if (last < text.length) blocks.push({ kind: 'text', content: text.slice(last) })
  return blocks
}
