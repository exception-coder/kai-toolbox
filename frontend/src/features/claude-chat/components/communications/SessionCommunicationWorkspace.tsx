import { Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getUser } from '@/lib/auth'
import { communicationError, type CommunicationFilter, type CommunicationReference } from '../../api/communicationJournal'
import { CommunicationEditor } from './CommunicationEditor'
import { CommunicationReader } from './CommunicationReader'
import { JournalRecordList } from './JournalRecordList'
import { useCommunicationJournal, type CommunicationJournal } from './useCommunicationJournal'
import { useJournalEditor } from './useJournalEditor'
import { useJournalActions } from './useJournalActions'

interface Props {
  sessionId: string; sessionTitle: string; readOnly?: boolean; initialRecordId?: string
  onReference: (sessionId: string, material: CommunicationReference) => Promise<void>
}
export default function SessionCommunicationWorkspace(props: Props) {
  return <BoundCommunicationWorkspace key={`${getUser()?.userId ?? 'local'}:${props.sessionId}`} {...props} />
}

/** 查询、草稿和迟到的写入结果始终绑定当前服务器会话。 */
function BoundCommunicationWorkspace({ sessionId, sessionTitle, readOnly = false, initialRecordId, onReference }: Props) {
  const journal = useCommunicationJournal(sessionId, initialRecordId)
  const editor = useJournalEditor(journal, readOnly), actions = useJournalActions(journal, { readOnly, onReference })
  const { userScope, selectedId, setSelectedId, notice, error, setNotice, setError, list, detail, refresh } = journal
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`沟通流水 · ${sessionTitle}`}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-6">
      <div className="min-w-0"><h1 className="text-base font-semibold">沟通流水</h1><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{sessionTitle} · {list.data ? `${list.data.total} 条记录` : '当前会话资料'}{readOnly ? ' · 已锁定，仅可查看' : ''}</p></div>
      <div className="flex gap-1"><Button variant="ghost" className="min-h-11" aria-label="刷新沟通流水" disabled={list.isFetching || actions.busy} onClick={refresh}><RefreshCw className={list.isFetching ? 'animate-spin' : ''} /></Button>
        <Button id={`communication-new-${sessionId}`} className="min-h-11" disabled={readOnly || actions.busy} onClick={editor.start}><Plus />{editor.draft ? '继续草稿' : '新增记录'}</Button></div>
    </header>
    <JournalFilters journal={journal} />
    {(notice || error) && <div className="flex items-start gap-3 border-b px-4 py-2 text-xs sm:px-6" role={error ? 'alert' : 'status'}>
      <p className="min-w-0 flex-1 py-2">{error || notice}</p><Button variant="ghost" className="min-h-11" onClick={() => { setNotice(''); setError(''); if (error) refresh() }}>{error ? '刷新核对' : '知道了'}</Button></div>}
    <div className="flex min-h-0 flex-1">
      <JournalRecordList journal={journal} editor={editor} actions={actions} readOnly={readOnly} />
      <section aria-label="沟通记录阅读" className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto', !selectedId && 'hidden md:block')}>
        {!selectedId && <div className="p-6 text-sm"><h2 className="font-medium">按沟通过程回顾需求</h2><p className="mt-3 max-w-md leading-7 text-[var(--color-muted-foreground)]">选择左侧记录，查看原文、截图与整理备注。可选多条引用到当前会话草稿，核对后再发送。</p></div>}
        {selectedId && detail.isPending && <p role="status" className="p-6 text-sm">正在读取沟通原文…</p>}
        {selectedId && detail.isError && <div role="alert" className="p-6 text-sm"><p>{communicationError(detail.error)}</p><div className="mt-3 flex gap-2"><Button variant="outline" className="min-h-11" onClick={() => void detail.refetch()}>重试原文</Button><Button variant="ghost" className="min-h-11" onClick={() => setSelectedId('')}>返回流水列表</Button></div></div>}
        {detail.data && selectedId && <CommunicationReader detail={detail.data} busy={actions.busy} readOnly={readOnly} onBack={() => setSelectedId('')} onEdit={editor.edit} onRemoved={value => void actions.remove(value)} onReference={() => void actions.quote([selectedId])} />}
      </section>
    </div>
    {editor.draft && <CommunicationEditor key={editor.draft.id} sessionId={sessionId} sessionTitle={sessionTitle} userScope={userScope} draft={editor.draft} open={editor.open} saving={editor.saving} error={editor.error}
      onChange={editor.change} onOpenChange={editor.setOpen} onSave={() => void editor.save()} storageAvailable={editor.storageAvailable} onDiscard={editor.discard} readOnly={readOnly} />}
  </div>
}

function JournalFilters({ journal }: { journal: CommunicationJournal }) {
  const { search, setSearch, filter, updateFilter } = journal
  const fieldClass = 'min-h-11 min-w-0 rounded-md border bg-transparent px-3 text-xs focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
  return <div className="flex flex-wrap gap-2 border-b px-4 py-3 sm:px-6">
    <label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-md border px-3 md:basis-56"><Search className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
      <input aria-label="搜索当前会话沟通记录" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} placeholder="搜索主题、原文、参与人、备注" /></label>
    <select aria-label="沟通时间顺序" className={fieldClass} value={filter.order} onChange={event => updateFilter({ order: event.target.value as CommunicationFilter['order'] })}><option value="desc">最新到最早</option><option value="asc">最早到最新</option></select>
    <select aria-label="整理备注筛选" className={fieldClass} value={filter.notes} onChange={event => updateFilter({ notes: event.target.value as CommunicationFilter['notes'] })}><option value="all">全部备注状态</option><option value="without">未加备注</option><option value="with">有整理备注</option></select>
    <select aria-label="沟通记录状态" className={fieldClass} value={String(filter.removed)} onChange={event => updateFilter({ removed: event.target.value === 'true' })}><option value="false">当前记录</option><option value="true">已移除</option></select>
  </div>
}
