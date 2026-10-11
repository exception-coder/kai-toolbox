import { useEffect, useRef, useState } from 'react'

const HEADING_SELECTOR = 'h2, h3, h4, h5, h6'

export interface TocEntry {
  id: string
  level: number
  text: string
}

interface TocPanelProps {
  /** 渲染区根节点（MarkdownView 的容器引用），变化时重新提取 */
  rootRef: React.RefObject<HTMLDivElement | null>
  /** content 变更触发重提取 */
  contentKey: string
  onEntriesChange?: (entries: TocEntry[]) => void
  renderTrailingAction?: (entry: TocEntry) => React.ReactNode
  showLabel?: boolean
}

export function TocPanel({
  rootRef,
  contentKey,
  onEntriesChange,
  renderTrailingAction,
  showLabel = true,
}: TocPanelProps) {
  const [entries, setEntries] = useState<TocEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const onEntriesChangeRef = useRef(onEntriesChange)
  onEntriesChangeRef.current = onEntriesChange

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      setEntries([])
      return
    }
    const refresh = () => {
      const headings = Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
      // 章节备注持久化引用旧 h2/h3 锚点，深层标题不能占用它们的顺序编号。
      let sectionIndex = 0
      let nestedIndex = 0
      const out: TocEntry[] = headings.map(el => {
        const level = Number(el.tagName.slice(1))
        const prefix = level <= 3 ? `doc-toc-${sectionIndex++}` : `doc-toc-h${level}-${nestedIndex++}`
        let id = el.id
        if (!id) {
          id = `${prefix}-${(el.textContent ?? '').slice(0, 30).replace(/\s+/g, '-')}`
          el.id = id
        }
        return { id, level, text: el.textContent ?? '' }
      })
      setEntries(out)
      onEntriesChangeRef.current?.(out)
      setActiveId(current =>
        current && out.some(entry => entry.id === current) ? current : out[0]?.id ?? null,
      )
    }
    refresh()
    const observer = new MutationObserver(mutations => {
      const headingChanged = mutations.some(mutation =>
        [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
          if (!(node instanceof HTMLElement)) return false
          return node.matches(HEADING_SELECTOR) || node.querySelector(HEADING_SELECTOR) !== null
        }),
      )
      if (headingChanged) refresh()
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [rootRef, contentKey])

  if (entries.length === 0) {
    return (
      <div className="text-xs text-[var(--color-muted-foreground)]">本文无章节标题</div>
    )
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      {showLabel && (
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          大纲
        </div>
      )}
      {entries.map(e => (
        <div key={e.id} className="group flex min-w-0 items-center gap-1">
          <a
            href={`#${e.id}`}
            title={e.text}
            aria-current={activeId === e.id ? 'location' : undefined}
            style={{ paddingLeft: 8 + (e.level - 2) * 12 }}
            onClick={ev => {
              ev.preventDefault()
              setActiveId(e.id)
              document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className={
              'min-w-0 flex-1 truncate rounded px-2 py-1 transition-colors hover:bg-[var(--color-accent)]/30 ' +
              (activeId === e.id ? 'bg-[var(--color-accent)]/40 font-medium' : '') +
              (e.level > 2 ? ' text-xs text-[var(--color-muted-foreground)]' : '')
            }
          >
            {e.text}
          </a>
          {renderTrailingAction?.(e)}
        </div>
      ))}
    </div>
  )
}
