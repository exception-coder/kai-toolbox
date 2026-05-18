import { useMemo } from 'react'
import type { Entry } from '../types'
import { groupKeyOf } from '../lib/format'
import { EntryItem } from './EntryItem'

interface Props {
  entries: Entry[]
  loading?: boolean
  onOpen: (id: string) => void
  onRemove: (id: string) => void
}

interface Group {
  key: string
  items: Entry[]
}

export function Timeline({ entries, loading, onOpen, onRemove }: Props) {
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Entry[]>()
    for (const e of entries) {
      const k = groupKeyOf(e.createdAt)
      const arr = map.get(k)
      if (arr) arr.push(e)
      else map.set(k, [e])
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }, [entries])

  if (loading) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-[var(--color-muted-foreground)]">
        正在加载历史记录…
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-[var(--color-muted-foreground)]">
        还没有记录，随手记一条吧。
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <section key={g.key} className="space-y-2">
          <h3 className="sticky top-0 z-10 -mx-1 bg-[var(--color-background)]/95 px-1 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)] backdrop-blur">
            {g.key}
            <span className="ml-2 text-[var(--color-muted-foreground)]/70">
              {g.items.length} 条
            </span>
          </h3>
          <div className="space-y-2">
            {g.items.map(e => (
              <EntryItem key={e.id} entry={e} onOpen={onOpen} onRemove={onRemove} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
