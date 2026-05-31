import { Link } from 'react-router-dom'
import { Code2, FileText, Image as ImageIcon, ListTree, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Java8guQuestion } from '../types'

interface Props {
  q: Java8guQuestion
}

export function QuestionCard({ q }: Props) {
  return (
    <Link
      to={`/tools/java8gu/q/${q.id}`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-md',
      )}
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-primary)]/40" />

      <div className="flex flex-1 flex-col p-4 pl-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[11px] tracking-wider text-[var(--color-muted-foreground)]">
            #{q.id}
          </span>
        </div>

        <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-tight text-[var(--color-foreground)]">
          {q.title}
        </h3>

        {q.tldr && (
          <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--color-muted-foreground)]">
            {q.tldr}
          </p>
        )}

        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-[var(--color-muted-foreground)]">
            <Stat icon={FileText} label={`${formatChars(q.chars)} 字`} />
            <span aria-hidden>·</span>
            <Stat icon={ListTree} label={`${q.headings.length} 节`} />
            {q.codeCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <Stat icon={Code2} label={`${q.codeCount} 段代码`} />
              </>
            )}
            {q.hasTable && (
              <>
                <span aria-hidden>·</span>
                <Stat icon={Table2} label="表" />
              </>
            )}
            {q.hasImage && (
              <>
                <span aria-hidden>·</span>
                <Stat icon={ImageIcon} label="图片" />
              </>
            )}
            <span aria-hidden>·</span>
            <span className="font-medium text-[var(--color-foreground)]">
              {q.readMin} min
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function Stat({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="h-3 w-3" />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}

function formatChars(n: number): string {
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}k`
}
