import { ArrowDownToLine, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { communicationError } from '../../api/communicationJournal'
import type { CommunicationJournal } from './useCommunicationJournal'
import type { JournalEditor } from './useJournalEditor'
import type { JournalActions } from './useJournalActions'
import { CommunicationReader } from './CommunicationReader'

export function JournalRecordList({ journal, editor, actions, readOnly }: {
  journal: CommunicationJournal; editor: JournalEditor; actions: JournalActions; readOnly: boolean
}) {
  const { selectedId, filter, selection, list, detail, updateFilter, setSearch, setSelectedId, setError } = journal
  const { busy, quote, toggle } = actions
  const expanded = <>
    {detail.isPending && <p role="status" className="p-4 text-sm">正在读取待办…</p>}
    {detail.isError && <div role="alert" className="p-4 text-sm"><p>{communicationError(detail.error)}</p><Button variant="outline" className="mt-2 min-h-11" onClick={() => void detail.refetch()}>重试内容</Button></div>}
    {detail.data && <CommunicationReader detail={detail.data} readOnly={readOnly} busy={busy} onEdit={editor.edit} onRemoved={value => void actions.remove(value)} onReference={() => void quote([selectedId])} />}
  </>
  return <section aria-label="开发待办卡片" className="flex min-h-0 min-w-0 flex-1 flex-col">
    {!filter.removed && selection.length > 0 && <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs"><span>已选 {selection.length} / 5</span>
      <Button variant="ghost" className="min-h-11 text-xs" disabled={busy || readOnly} onClick={() => void quote(selection)}>{busy ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}引用所选</Button></div>}
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      {list.isPending && <p role="status" className="text-sm">正在读取待办…</p>}
      {list.isError && <div role="alert" className="text-sm"><p>{communicationError(list.error)}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => void list.refetch()}>重试列表</Button></div>}
      {list.data?.records.length === 0 && <div className="space-y-3 text-sm"><p>{filter.q || filter.removed ? '没有符合条件的待办。' : '还没有待办，记下内容或贴张图就行。'}</p>
        {filter.q || filter.removed ? <Button variant="outline" className="min-h-11" onClick={() => { setSearch(''); updateFilter({ q: '', notes: 'all', removed: false }) }}>清空筛选</Button>
          : <Button variant="outline" className="min-h-11" disabled={readOnly} onClick={editor.start}>新增待办</Button>}</div>}
      <div className="grid items-start gap-3 xl:grid-cols-2">
        {list.data?.records.map(row => <article key={row.id} className={cn('min-w-0 rounded-lg border bg-[var(--color-background)]', selectedId === row.id && 'xl:col-span-2')}>
          <div className="flex items-start gap-3 p-4">
            {!filter.removed && <input type="checkbox" aria-label={`选择记录 ${row.title}`} className="mt-3 size-4 shrink-0 accent-[var(--color-primary)]" checked={selection.includes(row.id)} disabled={readOnly || busy} onChange={() => toggle(row.id)} />}
            <button type="button" aria-expanded={selectedId === row.id} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" onClick={() => { setSelectedId(selectedId === row.id ? '' : row.id); setError('') }}>
              <time className="text-xs text-[var(--color-muted-foreground)]">{new Date(row.occurredAt).toLocaleString()}</time>
              <h2 className="mt-2 break-words text-sm font-medium leading-6">{row.title}</h2>
              {selectedId !== row.id && row.excerpt !== row.title && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6">{row.excerpt}</p>}
              {row.imageCount > 0 && <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{row.imageCount} 张图片 · 点击查看</p>}
            </button>
          </div>
          {selectedId === row.id && <div className="border-t">{expanded}</div>}
        </article>)}
      </div>
      {selectedId && list.data && !list.data.records.some(row => row.id === selectedId) && <div className="mt-3 rounded-lg border">{expanded}<Button variant="ghost" className="min-h-11" onClick={() => setSelectedId('')}>收起待办</Button></div>}
    </div>
    {list.data && list.data.total > 20 && <footer className="flex items-center justify-between border-t px-3 py-2 text-xs"><span>第 {filter.page + 1} 页</span><div className="flex">
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="上一页待办" disabled={filter.page === 0 || list.isFetching} onClick={() => updateFilter({ page: filter.page - 1 })}><ChevronLeft /></Button>
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="下一页待办" disabled={(filter.page + 1) * 20 >= list.data.total || list.isFetching} onClick={() => updateFilter({ page: filter.page + 1 })}><ChevronRight /></Button></div></footer>}
  </section>
}
