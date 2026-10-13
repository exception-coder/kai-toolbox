import { ArrowDownToLine, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { communicationError } from '../../api/communicationJournal'
import type { CommunicationJournal } from './useCommunicationJournal'
import type { JournalEditor } from './useJournalEditor'
import type { JournalActions } from './useJournalActions'

export function JournalRecordList({ journal, editor, actions, readOnly }: {
  journal: CommunicationJournal; editor: JournalEditor; actions: JournalActions; readOnly: boolean
}) {
  const { selectedId, filter, selection, list, updateFilter, setSearch, setSelectedId, setError } = journal
  const { busy, quote, toggle } = actions
  return <section aria-label="流水记录列表" className={cn('min-h-0 min-w-0 flex-1 flex-col md:w-72 md:max-w-80 md:flex-none md:border-r', selectedId ? 'hidden md:flex' : 'flex')}>
    {!filter.removed && <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs"><span>已选 {selection.length} / 5</span>
      <Button variant="ghost" className="min-h-11 text-xs" disabled={!selection.length || busy || readOnly} onClick={() => void quote(selection)}>{busy ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}引用所选</Button></div>}
    <div className="min-h-0 flex-1 overflow-y-auto">
      {list.isPending && <p role="status" className="p-4 text-sm">正在读取沟通记录…</p>}
      {list.isError && <div role="alert" className="p-4 text-sm"><p>{communicationError(list.error)}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => void list.refetch()}>重试列表</Button></div>}
      {list.data?.records.length === 0 && <div className="space-y-3 p-4 text-sm"><p>{filter.q || filter.removed || filter.notes !== 'all' ? '当前筛选下没有记录。' : '还没有沟通记录。将散落的讨论和截图留在当前会话，后续可以回顾并引用。'}</p>
        {filter.q || filter.removed || filter.notes !== 'all' ? <Button variant="outline" className="min-h-11" onClick={() => { setSearch(''); updateFilter({ q: '', notes: 'all', removed: false }) }}>清空筛选</Button>
          : <Button variant="outline" className="min-h-11" disabled={readOnly} onClick={editor.start}>保存第一条沟通</Button>}</div>}
      {list.data?.records.map(row => <div key={row.id} className={cn('flex items-start gap-3 border-b px-4 py-3', selectedId === row.id && 'bg-[var(--color-accent)]')}>
        {!filter.removed && <input type="checkbox" aria-label={`选择记录 ${row.title}`} className="mt-3 size-4 shrink-0 accent-[var(--color-primary)]" checked={selection.includes(row.id)} disabled={readOnly || busy} onChange={() => toggle(row.id)} />}
        <button type="button" aria-current={selectedId === row.id ? 'true' : undefined} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" onClick={() => { setSelectedId(row.id); setError('') }}>
          <time className="text-xs text-[var(--color-muted-foreground)]">{new Date(row.occurredAt).toLocaleString()}</time><h2 className="mt-1 break-words text-sm font-medium leading-6">{row.title}</h2>
          <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--color-muted-foreground)]">{row.notesExcerpt || row.excerpt || '截图沟通'}</p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{row.source || '未填写来源'} · {row.notesExcerpt ? '有整理备注' : '未加备注'}{row.imageCount ? ` · ${row.imageCount} 张截图` : ''}</p>
        </button></div>)}
    </div>
    <footer className="flex items-center justify-between border-t px-3 py-2 text-xs"><span>第 {filter.page + 1} 页</span><div className="flex">
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="上一页流水" disabled={filter.page === 0 || list.isFetching} onClick={() => updateFilter({ page: filter.page - 1 })}><ChevronLeft /></Button>
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="下一页流水" disabled={!list.data || (filter.page + 1) * 20 >= list.data.total || list.isFetching} onClick={() => updateFilter({ page: filter.page + 1 })}><ChevronRight /></Button></div></footer>
  </section>
}
