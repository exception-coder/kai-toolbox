import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { HttpCallCard } from './HttpCallCard'
import type { HttpCallStreamView, HttpCallView } from '../types'

type AnyCall = HttpCallStreamView | HttpCallView

interface Props {
  calls: AnyCall[]
  /** 编排页用：勾选支持 */
  selectedIds?: Set<string>
  onToggleSelect?: (id: string, next: boolean) => void
  /** 空态文案 */
  emptyText?: string
}

/**
 * HTTP 调用时间线。按 seq 升序展示；支持按 URL/方法过滤；可选勾选模式。
 */
export function CallTimeline({ calls, selectedIds, onToggleSelect, emptyText }: Props) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return calls
    return calls.filter(c =>
      c.url.toLowerCase().includes(q) || c.method.toLowerCase().includes(q),
    )
  }, [calls, filter])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Input
        placeholder="过滤 method / URL…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      {filtered.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-[var(--color-muted-foreground)]">
          {filter ? '没有匹配的调用' : (emptyText ?? '还没有 HTTP 调用。开始录制后这里会实时滚动')}
        </div>
      )}
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto">
        {filtered.map(c => (
          <li key={c.id}>
            <HttpCallCard
              call={c}
              selected={selectedIds?.has(c.id)}
              onSelect={onToggleSelect ? next => onToggleSelect(c.id, next) : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
