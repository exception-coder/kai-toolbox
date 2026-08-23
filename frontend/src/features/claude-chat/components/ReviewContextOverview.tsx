import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseReviewContextSnapshot } from '../lib/reviewShareContext'

interface Props {
  snapshot: string
  publicView?: boolean
  className?: string
}

const PRIMARY_SECTIONS = new Set(['评审对象', '模块定义', '审计边界'])

function visibleContent(title: string, content: string, publicView: boolean): string {
  if (!publicView || title !== '模块定义') return content
  return content.split('\n').filter(line => !line.startsWith('代码边界：')).join('\n').trim()
}

/** 同一不可变快照在开发确认和公开评审页上的结构化只读投影。 */
export function ReviewContextOverview({ snapshot, publicView = false, className }: Props) {
  const parsed = parseReviewContextSnapshot(snapshot)
  const StatusIcon = parsed.status === 'READY' ? CheckCircle2
    : parsed.status === 'BLOCKED' ? AlertTriangle : CircleDashed
  const statusLabel = parsed.status === 'READY' ? '上下文完整'
    : parsed.status === 'BLOCKED' ? '上下文待修正' : '上下文有缺口'
  const primary = parsed.sections.filter(section => PRIMARY_SECTIONS.has(section.title))
  const evidence = parsed.sections.filter(section => !PRIMARY_SECTIONS.has(section.title))

  if (parsed.sections.length === 0) {
    return <pre className={cn('max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5', className)}>{snapshot}</pre>
  }

  return (
    <div className={cn('text-sm', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
        <div>
          <p className="font-medium text-[var(--color-foreground)]">{parsed.fields['项目'] || parsed.fields['系统'] || '评审上下文'}</p>
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            {[parsed.fields['模块'], parsed.fields['模块索引']].filter(Boolean).join(' · ') || '历史评审快照'}
          </p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium',
          parsed.status === 'READY' ? 'text-emerald-700 dark:text-emerald-300'
            : parsed.status === 'BLOCKED' ? 'text-red-700 dark:text-red-300'
              : 'text-amber-700 dark:text-amber-300')}>
          <StatusIcon className="size-4" />{statusLabel}
        </span>
      </div>

      <div className="grid gap-x-6 gap-y-4 py-4 sm:grid-cols-2">
        {primary.map(section => (
          <section key={section.title} className={section.title === '审计边界' ? 'sm:col-span-2' : undefined}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">{section.title}</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-foreground)]">
              {visibleContent(section.title, section.content, publicView)}
            </p>
          </section>
        ))}
      </div>

      <div className="border-t border-[var(--color-border)]">
        {evidence.map((section, index) => (
          <details key={section.title} open={!publicView && index === 0} className="border-b border-[var(--color-border)] py-3 last:border-b-0">
            <summary className="cursor-pointer select-none text-sm font-medium text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
              {section.title}
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap bg-transparent text-xs leading-5 text-[var(--color-muted-foreground)]">
              {section.content}
            </pre>
          </details>
        ))}
      </div>
      {parsed.legacy && <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">历史链接未包含模块索引元数据，回答依据以创建时保存的原始快照为准。</p>}
    </div>
  )
}
