import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

/**
 * 轻量 Markdown 渲染：marked 解析 → DOMPurify 消毒 → dangerouslySetInnerHTML。
 *
 * 自包含、不引新依赖、不复用（存在 typecheck 存量问题的）MarkdownViewer；样式用 Tailwind 任意变体
 * 内联，覆盖标题/列表/代码块/引用/表格。八股答案常含代码与分点，渲染后比纯文本好读。
 * 解析选项随调用传入，不调用全局 marked.use，避免与其它功能的 marked 配置互相污染。
 */
export function Java8guMarkdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    if (!text || !text.trim()) {
      return ''
    }
    try {
      const raw = marked.parse(text, { async: false, gfm: true, breaks: false }) as string
      return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, ADD_ATTR: ['target', 'class'] })
    } catch {
      return ''
    }
  }, [text])

  if (!html) {
    return <div className={cn('whitespace-pre-wrap text-sm', className)}>{text}</div>
  }

  return (
    <div
      className={cn(
        'text-sm leading-relaxed break-words',
        '[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold',
        '[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold',
        '[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold',
        '[&_p]:my-1.5',
        '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-0.5',
        '[&_strong]:font-semibold',
        '[&_a]:text-[var(--color-primary)] [&_a]:underline',
        '[&_code]:rounded [&_code]:bg-[var(--color-muted)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[var(--color-muted)] [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.85em]',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-muted-foreground)]',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border [&_th]:border-[var(--color-border)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-2 [&_td]:py-1',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
