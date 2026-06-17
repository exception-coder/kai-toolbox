import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

/**
 * 渲染 assistant 回复的 markdown：marked 解析 → DOMPurify 消毒 → 注入。
 * 仅用于展示模型输出（受 sanitize 保护），不要用于渲染用户原始输入。
 * 样式用 tailwind arbitrary variants 内联，自包含、不碰全局 CSS。
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(text ?? '', { async: false, gfm: true, breaks: true }) as string
      return DOMPurify.sanitize(raw)
    } catch {
      return null
    }
  }, [text])

  // 解析失败兜底：降级为纯文本，不崩溃
  if (html == null) {
    return <div className={cn('min-w-0 max-w-full whitespace-pre-wrap [overflow-wrap:anywhere]', className)}>{text}</div>
  }

  return (
    <div
      className={cn(
        'markdown-body min-w-0 max-w-full [overflow-wrap:anywhere] text-sm leading-relaxed',
        '[&_h1]:my-3 [&_h1]:text-xl [&_h1]:font-semibold',
        '[&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold',
        '[&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold',
        '[&_h4]:my-2 [&_h4]:font-semibold',
        '[&_p]:my-2',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--color-muted)] [&_pre]:p-3 [&_pre]:text-xs',
        '[&_code]:font-mono [&_code]:text-[0.9em]',
        '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-[var(--color-muted)] [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:[overflow-wrap:anywhere]',
        '[&_a]:text-[var(--color-primary)] [&_a]:underline [&_a]:underline-offset-2',
        '[&_strong]:font-semibold',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border)] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[var(--color-muted-foreground)]',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border [&_th]:border-[var(--color-border)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-2 [&_td]:py-1',
        '[&_hr]:my-3 [&_hr]:border-[var(--color-border)]',
        '[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
