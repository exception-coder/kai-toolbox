import { useEffect, useState } from 'react'

interface TocEntry {
  id: string
  level: number
  text: string
}

interface TocPanelProps {
  /** 渲染区根节点（MarkdownView 的容器引用），变化时重新提取 */
  rootRef: React.RefObject<HTMLDivElement | null>
  /** content 变更触发重提取 */
  contentKey: string
}

export function TocPanel({ rootRef, contentKey }: TocPanelProps) {
  const [entries, setEntries] = useState<TocEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      setEntries([])
      return
    }
    const headings = Array.from(root.querySelectorAll<HTMLElement>('h2, h3'))
    const out: TocEntry[] = headings.map((el, i) => {
      let id = el.id
      if (!id) {
        id = `doc-toc-${i}-${(el.textContent ?? '').slice(0, 30).replace(/\s+/g, '-')}`
        el.id = id
      }
      return {
        id,
        level: el.tagName === 'H2' ? 2 : 3,
        text: el.textContent ?? '',
      }
    })
    setEntries(out)
    setActiveId(out[0]?.id ?? null)
  }, [rootRef, contentKey])

  if (entries.length === 0) {
    return (
      <div className="text-xs text-[var(--color-muted-foreground)]">本文无章节标题</div>
    )
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        大纲
      </div>
      {entries.map(e => (
        <a
          key={e.id}
          href={`#${e.id}`}
          onClick={ev => {
            ev.preventDefault()
            setActiveId(e.id)
            document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className={
            'truncate rounded px-2 py-1 transition-colors hover:bg-[var(--color-accent)]/30 ' +
            (activeId === e.id ? 'bg-[var(--color-accent)]/40 font-medium' : '') +
            (e.level === 3 ? ' pl-5 text-xs text-[var(--color-muted-foreground)]' : '')
          }
        >
          {e.text}
        </a>
      ))}
    </div>
  )
}
