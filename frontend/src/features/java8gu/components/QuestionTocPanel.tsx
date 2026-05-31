import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TocItem } from '../lib/markdown'

interface Props {
  items: TocItem[]
  containerRef: React.RefObject<HTMLElement | null>
}

export function QuestionTocPanel({ items, containerRef }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)

  // 滚动监听：当前可见的最上方标题作为 active
  useEffect(() => {
    if (items.length === 0) return
    const root = containerRef.current
    if (!root) return

    const headings = items
      .map(it => document.getElementById(it.id))
      .filter((el): el is HTMLElement => !!el)
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        // 选可见且最靠上的；若都不可见则保持
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    )
    headings.forEach(h => observer.observe(h))
    return () => observer.disconnect()
  }, [items, containerRef])

  if (items.length === 0) return null

  return (
    <nav className="text-xs">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        本题章节
      </div>
      <ul className="space-y-0.5 border-l border-[var(--color-border)]">
        {items.map(it => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className={cn(
                '-ml-px block border-l-2 py-1 pl-3 transition-colors',
                activeId === it.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-muted-foreground)] hover:border-[var(--color-border)] hover:text-[var(--color-foreground)]',
                it.level === 3 && 'pl-5 text-[11.5px]',
                it.level === 4 && 'pl-7 text-[11px]',
              )}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
