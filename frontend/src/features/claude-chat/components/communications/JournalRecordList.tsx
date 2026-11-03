import { useState } from 'react'
import { ArrowDownToLine, CheckCircle2, Circle, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { communicationError, type CommunicationSummary } from '../../api/communicationJournal'
import type { CommunicationJournal } from './useCommunicationJournal'
import type { JournalEditor } from './useJournalEditor'
import type { JournalActions } from './useJournalActions'
import { CommunicationReader } from './CommunicationReader'

function RowMenu({ row, editor, actions, disabled }: { row: CommunicationSummary; editor: JournalEditor; actions: JournalActions; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="ghost" className="size-11 p-0" aria-label={`更多操作 ${row.title}`} disabled={disabled}><MoreHorizontal /></Button></PopoverTrigger>
    <PopoverContent align="end" className="flex min-w-36 flex-col p-1" aria-label="待办操作">
      <Button variant="ghost" className="min-h-11 justify-start" onClick={() => { setOpen(false); void editor.editRecord(row.id) }}><Pencil />编辑</Button>
      <Button variant="ghost" className="min-h-11 justify-start" onClick={() => { setOpen(false); void actions.remove(true, row) }}><Trash2 />移除（可恢复）</Button>
    </PopoverContent>
  </Popover>
}

/** 自动生成的标题通常来自首行，摘要不再重复这一行。 */
function excerpt(row: CommunicationSummary) {
  const text = row.excerpt.trim()
  return text.startsWith(row.title) ? text.slice(row.title.length).trim() : text
}
export function JournalRecordList({ journal, editor, actions, readOnly, sessionTitle }: {
  journal: CommunicationJournal; editor: JournalEditor; actions: JournalActions; readOnly: boolean; sessionTitle: string
}) {
  const { selectedId, filter, selection, list, detail, updateFilter, setSearch, setSelectedId, setError, setSelection } = journal
  const [selecting, setSelecting] = useState(false), [manageOpen, setManageOpen] = useState(false)
  const { busy, quote, toggle } = actions
  const targets = list.data?.records.filter(row => selection.includes(row.id)) ?? []
  const expanded = <>
    {detail.isPending && <p role="status" className="p-4 text-sm">正在读取待办…</p>}
    {detail.isError && <div role="alert" className="p-4 text-sm"><p>{communicationError(detail.error)}</p><Button variant="outline" className="mt-2 min-h-11" onClick={() => void detail.refetch()}>重试内容</Button></div>}
    {detail.data && <CommunicationReader detail={detail.data} readOnly={readOnly} busy={busy} hideActions={!!list.data?.records.some(row => row.id === selectedId)} onEdit={editor.edit} onRemoved={value => void actions.remove(value)} onReference={() => void quote([selectedId])} />}
  </>
  return <section aria-label="开发待办列表" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center justify-between px-4 text-xs text-[var(--color-muted-foreground)]">
      <span>{filter.removed ? '已移除 · 可恢复' : selecting ? '选择待办（最多 5 条）' : '当前会话'}</span>
      <div className="flex items-center">
        {!filter.removed && <Button variant="ghost" className="min-h-11 text-xs" disabled={busy || readOnly} onClick={() => { setSelecting(!selecting); setSelection([]) }}>{selecting ? '取消选择' : '批量选择'}</Button>}
        <Popover open={manageOpen} onOpenChange={setManageOpen}><PopoverTrigger asChild><Button variant="ghost" className="size-11 p-0" aria-label="待办管理" disabled={busy}><MoreHorizontal /></Button></PopoverTrigger>
          <PopoverContent align="end" className="p-1"><Button variant="ghost" className="min-h-11" onClick={() => { updateFilter({ removed: !filter.removed, status: 'all' }); setSelecting(false); setManageOpen(false) }}><RotateCcw />{filter.removed ? '返回全部待办' : '查看已移除'}</Button></PopoverContent>
        </Popover>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" data-testid="todo-list-scroll">
      {list.isPending && <p role="status" className="py-4 text-sm">正在读取待办…</p>}
      {list.isError && <div role="alert" className="py-4 text-sm"><p>{communicationError(list.error)}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => void list.refetch()}>重试列表</Button></div>}
      {list.data?.records.length === 0 && <div className="py-4 text-sm"><p>{filter.q || filter.removed || filter.status === 'completed' ? '没有符合条件的待办。' : '暂无待办，点击右上角新增。'}</p>
        {(filter.q || filter.removed || filter.status === 'completed') && <Button variant="ghost" className="mt-2 min-h-11" onClick={() => { setSearch(''); updateFilter({ q: '', removed: false, status: 'all' }) }}>查看全部待办</Button>}</div>}
      <div className="divide-y">
        {list.data?.records.map(row => <article key={row.id} className="min-w-0 bg-[var(--color-background)] py-2" aria-label={row.title}>
          <div className="flex items-start gap-1">
            {selecting && !filter.removed && <label className="flex size-11 shrink-0 items-center justify-center"><input type="checkbox" aria-label={`选择记录 ${row.title}`} className="size-4 accent-[var(--color-primary)]" checked={selection.includes(row.id)} disabled={readOnly || busy} onChange={() => toggle(row.id)} /></label>}
            {!filter.removed && !selecting && <Button variant="ghost" className="size-11 shrink-0 p-0" aria-label={row.completedAt ? '取消完成' : '标记完成'} aria-pressed={!!row.completedAt} disabled={readOnly || busy} onClick={() => void actions.complete([row], !row.completedAt)}>
              {row.completedAt ? <CheckCircle2 className="text-[var(--color-primary)]" /> : <Circle className="text-[var(--color-muted-foreground)]" />}</Button>}
            <button type="button" aria-expanded={selectedId === row.id} className="min-h-11 min-w-0 flex-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" onClick={() => { setSelectedId(selectedId === row.id ? '' : row.id); setError('') }}>
              <h2 className="break-words text-[15px] font-medium leading-6">{row.title}</h2>
              <time className="text-xs text-[var(--color-muted-foreground)]">{new Date(row.createdAt ?? row.occurredAt).toLocaleString()} 创建{row.completedAt ? ' · 已完成' : ''}</time>
            </button>
          </div>
          {selectedId !== row.id && excerpt(row) && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6">{excerpt(row)}</p>}
          {row.imageCount > 0 && selectedId !== row.id && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{row.imageCount} 张图片 · 点击标题查看</p>}
          <div className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]" title={sessionTitle}>{sessionTitle}</span>
            {filter.removed ? <Button variant="ghost" className="min-h-11 text-xs" disabled={busy || readOnly} onClick={() => void actions.remove(false, row)}><RotateCcw />恢复记录</Button>
              : <><Button variant="ghost" className="min-h-11 shrink-0 text-xs" disabled={busy || readOnly} onClick={() => void quote([row.id])}><ArrowDownToLine />引用到草稿</Button><RowMenu row={row} editor={editor} actions={actions} disabled={busy || readOnly} /></>}
          </div>
          {selectedId === row.id && expanded}
        </article>)}
      </div>
      {selectedId && list.data && !list.data.records.some(row => row.id === selectedId) && <div>{expanded}<Button variant="ghost" className="min-h-11" onClick={() => setSelectedId('')}>收起待办</Button></div>}
    </div>
    {!filter.removed && selection.length > 0 && <div className="flex shrink-0 flex-wrap items-center gap-1 border-t bg-[var(--color-background)] px-4 text-xs">
      <span className="mr-auto">已选 {selection.length}</span>
      <Button variant="ghost" className="min-h-11 text-xs" disabled={busy || readOnly} onClick={() => void actions.complete(targets, filter.status !== 'completed')}>{filter.status === 'completed' ? '取消完成所选' : '完成所选'}</Button>
      <Button variant="ghost" className="min-h-11 text-xs" disabled={busy || readOnly} onClick={() => void quote(selection)}><ArrowDownToLine />引用所选</Button></div>}
    {list.data && list.data.total > 20 && <footer className="flex shrink-0 items-center justify-between border-t px-3 text-xs"><span>第 {filter.page + 1} 页</span><div className="flex">
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="上一页待办" disabled={filter.page === 0 || list.isFetching || busy} onClick={() => updateFilter({ page: filter.page - 1 })}><ChevronLeft /></Button>
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="下一页待办" disabled={(filter.page + 1) * 20 >= list.data.total || list.isFetching || busy} onClick={() => updateFilter({ page: filter.page + 1 })}><ChevronRight /></Button></div></footer>}
  </section>
}
