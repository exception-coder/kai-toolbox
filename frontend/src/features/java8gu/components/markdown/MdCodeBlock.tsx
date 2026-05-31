import { useEffect, useState } from 'react'
import { Check, Copy, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'
import { getHighlighter } from './shiki'

interface Props {
  code: string
  lang?: string
  className?: string
}

export function MdCodeBlock({ code, lang = 'text', className }: Props) {
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)
  const isDark = useIsDarkTheme()

  useEffect(() => {
    let cancelled = false
    getHighlighter().then(highlighter => {
      if (cancelled) return
      const h = highlighter.codeToHtml(code, {
        lang: lang || 'text',
        theme: isDark ? 'github-dark' : 'github-light',
      })
      setHtml(h)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang, isDark])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy!', err)
    }
  }

  return (
    <div className={cn('group relative my-6 overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-sm transition-shadow hover:shadow-md', className)}>
      {/* Mac Style Header */}
      <div className="flex items-center justify-between border-b bg-[var(--color-muted)]/30 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-rose-400/80" />
          <div className="h-3 w-3 rounded-full bg-amber-400/80" />
          <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
          <span className="ml-2 flex items-center gap-1 font-mono text-[11px] font-medium text-[var(--color-muted-foreground)]">
            <Terminal className="h-3 w-3" />
            {lang}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title="复制代码"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Code Content */}
      <div className="overflow-x-auto">
        {html ? (
          <div
            className="shiki-container py-4 text-[13px] leading-relaxed [&>pre]:!bg-transparent [&>pre]:!p-0 [&>pre]:px-4"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="p-4 font-mono text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
