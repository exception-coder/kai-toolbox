import React from 'react'
import type { Token, Tokens } from 'marked'
import { ExternalLink, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hashSlug } from '../../lib/markdown'
import { MdCodeBlock } from './MdCodeBlock'
import { MdAdmonition, type AdmonitionType } from './MdAdmonition'

interface Props {
  tokens: Token[]
  className?: string
}

export function MarkdownViewer({ tokens, className }: Props) {
  return (
    <div className={cn('markdown-viewer text-[15px] leading-relaxed text-[var(--color-foreground)]', className)}>
      {tokens.map((token, i) => (
        <TokenRenderer key={i} token={token} />
      ))}
    </div>
  )
}

function TokenRenderer({ token }: { token: Token }) {
  // marked 的 Token 联合里含 Tokens.Generic（type: string + 索引签名），会污染
  // 判别式收窄——switch 后属性仍可能退化成 any/undefined。每个 case 显式 as 到
  // 具体 Tokens.* 才能拿到精确字段类型。
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading
      const depth = t.depth
      const id = `j8-h-${depth}-${hashSlug(t.text)}`
      const baseClass = 'group relative font-semibold tracking-tight text-[var(--color-foreground)] scroll-mt-20'

      // H1 is usually rendered by the page header, so we can hide it or render it differently
      if (depth === 1) return null

      const depthClasses: Record<number, string> = {
        2: 'mt-10 mb-5 text-xl border-b pb-2',
        3: 'mt-8 mb-4 text-lg',
        4: 'mt-6 mb-3 text-base',
      }

      const Tag = `h${depth}` as React.ElementType
      return (
        <Tag id={id} className={cn(baseClass, depthClasses[depth] || 'mt-6 mb-3')}>
          <a href={`#${id}`} className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
            <Hash className="h-4 w-4 text-[var(--color-primary)]" />
          </a>
          <InlineRenderer tokens={t.tokens} />
        </Tag>
      )
    }

    case 'paragraph':
      return (
        <p className="my-4 last:mb-0">
          <InlineRenderer tokens={(token as Tokens.Paragraph).tokens} />
        </p>
      )

    case 'blockquote': {
      const t = token as Tokens.Blockquote
      // Parse Admonition
      const firstToken = t.tokens[0]
      if (firstToken?.type === 'paragraph') {
        const text = (firstToken as Tokens.Paragraph).text
        const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]/i)
        if (match) {
          const typeMap: Record<string, AdmonitionType> = {
            note: 'note',
            tip: 'tip',
            important: 'info',
            warning: 'warning',
            caution: 'danger',
            danger: 'danger',
            info: 'info',
          }
          const type = typeMap[match[1].toLowerCase()] || 'note'
          // Remove the marker from the first paragraph
          const remainingTokens = [...t.tokens]
          const firstPara = { ...remainingTokens[0] } as any
          firstPara.text = firstPara.text.replace(/^\[!.*?\]\s*/, '')
          // Also need to update the nested tokens of the first paragraph if they exist
          if (firstPara.tokens?.[0]?.type === 'text') {
            firstPara.tokens[0].text = firstPara.tokens[0].text.replace(/^\[!.*?\]\s*/, '')
          }
          remainingTokens[0] = firstPara

          return (
            <MdAdmonition type={type}>
              {remainingTokens.map((t, i) => <TokenRenderer key={i} token={t} />)}
            </MdAdmonition>
          )
        }
      }
      return (
        <blockquote className="my-6 border-l-4 border-[var(--color-primary)]/40 bg-[var(--color-muted)]/20 py-2 pl-4 italic text-[var(--color-muted-foreground)]">
          {t.tokens.map((child, i) => <TokenRenderer key={i} token={child} />)}
        </blockquote>
      )
    }

    case 'list': {
      const t = token as Tokens.List
      const Tag = t.ordered ? 'ol' : 'ul'
      return (
        <Tag className={cn('my-5 space-y-2 pl-6', t.ordered ? 'list-decimal' : 'list-disc')}>
          {t.items.map((item, i) => (
            <li key={i} className="pl-1">
              {item.tokens.map((child, j) => <TokenRenderer key={j} token={child} />)}
            </li>
          ))}
        </Tag>
      )
    }

    case 'code': {
      const t = token as Tokens.Code
      if (t.lang === 'mermaid') return null
      return <MdCodeBlock code={t.text} lang={t.lang} />
    }

    case 'table': {
      const t = token as Tokens.Table
      return (
        <div className="my-6 overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--color-muted)]/50">
              <tr>
                {t.header.map((cell, i) => (
                  <th key={i} className="border-b px-4 py-3 font-semibold text-[var(--color-foreground)]">
                    <InlineRenderer tokens={cell.tokens} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {t.rows.map((row, i) => (
                <tr key={i} className="transition-colors hover:bg-[var(--color-muted)]/20">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-3 text-[var(--color-foreground)]/90">
                      <InlineRenderer tokens={cell.tokens} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'hr':
      return <hr className="my-10 border-dashed border-[var(--color-border)]" />

    case 'space':
      return null

    default:
      // Fallback for text and unknown tokens
      if ('tokens' in token && token.tokens) {
        return <InlineRenderer tokens={token.tokens} />
      }
      return <span>{(token as any).text || ''}</span>
  }
}

function InlineRenderer({ tokens }: { tokens?: Token[] }) {
  if (!tokens) return null
  return (
    <>
      {tokens.map((token, i) => {
        switch (token.type) {
          case 'strong':
            return <strong key={i} className="font-semibold text-[var(--color-foreground)]"><InlineRenderer tokens={(token as Tokens.Strong).tokens} /></strong>
          case 'em':
            return <em key={i} className="italic"><InlineRenderer tokens={(token as Tokens.Em).tokens} /></em>
          case 'codespan':
            return <code key={i} className="rounded bg-[var(--color-muted)]/60 px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--color-foreground)]">{(token as Tokens.Codespan).text}</code>
          case 'link': {
            const t = token as Tokens.Link
            return (
              <a
                key={i}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[var(--color-primary)] underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
              >
                <InlineRenderer tokens={t.tokens} />
                <ExternalLink className="h-3 w-3" />
              </a>
            )
          }
          case 'image': {
            const t = token as Tokens.Image
            return (
              <img
                key={i}
                src={t.href}
                alt={t.text}
                className="my-4 max-w-full rounded-lg border shadow-sm"
              />
            )
          }
          case 'br':
            return <br key={i} />
          case 'del':
            return <del key={i} className="line-through opacity-60"><InlineRenderer tokens={(token as Tokens.Del).tokens} /></del>
          case 'text':
            return <span key={i}>{(token as Tokens.Text).text}</span>
          default:
            return <span key={i}>{(token as { text?: string }).text || ''}</span>
        }
      })}
    </>
  )
}
