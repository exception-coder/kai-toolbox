import { Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUser } from '@/lib/auth'
import type { CommunicationReference } from '../../api/communicationJournal'
import { CommunicationEditor } from './CommunicationEditor'
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
  const { userScope, notice, error, setNotice, setError, list, refresh } = journal
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`开发待办 · ${sessionTitle}`}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-6">
      <div className="min-w-0"><h1 className="text-base font-semibold">开发待办</h1><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{sessionTitle}{list.data ? ` · ${list.data.total} 条` : ''}{readOnly ? ' · 已锁定，仅可查看' : ''}</p></div>
      <div className="flex gap-1"><Button variant="ghost" className="min-h-11" aria-label="刷新开发待办" disabled={list.isFetching || actions.busy} onClick={refresh}><RefreshCw className={list.isFetching ? 'animate-spin' : ''} /></Button>
        <Button id={`communication-new-${sessionId}`} className="min-h-11" disabled={readOnly || actions.busy} onClick={editor.start}><Plus />{editor.draft ? '继续草稿' : '新增待办'}</Button></div>
    </header>
    <JournalFilters journal={journal} />
    {(notice || error) && <div className="flex items-start gap-3 border-b px-4 py-2 text-xs sm:px-6" role={error ? 'alert' : 'status'}>
      <p className="min-w-0 flex-1 py-2">{error || notice}</p><Button variant="ghost" className="min-h-11" onClick={() => { setNotice(''); setError(''); if (error) refresh() }}>{error ? '刷新核对' : '知道了'}</Button></div>}
    <JournalRecordList journal={journal} editor={editor} actions={actions} readOnly={readOnly} />
    {editor.draft && <CommunicationEditor key={editor.draft.id} sessionId={sessionId} sessionTitle={sessionTitle} userScope={userScope} draft={editor.draft} open={editor.open} saving={editor.saving} error={editor.error}
      onChange={editor.change} onOpenChange={editor.setOpen} onSave={() => void editor.save()} storageAvailable={editor.storageAvailable} onDiscard={editor.discard} readOnly={readOnly} />}
  </div>
}

function JournalFilters({ journal }: { journal: CommunicationJournal }) {
  const { search, setSearch, filter, updateFilter } = journal
  const fieldClass = 'min-h-11 min-w-0 rounded-md border bg-transparent px-3 text-xs focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
  return <div className="flex flex-wrap gap-2 border-b px-4 py-3 sm:px-6">
    <label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-md border px-3 md:basis-56"><Search className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
      <input aria-label="搜索当前会话待办" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} placeholder="搜索待办内容" /></label>
    <select aria-label="待办显示范围" className={fieldClass} value={String(filter.removed)} onChange={event => updateFilter({ removed: event.target.value === 'true' })}><option value="false">当前待办</option><option value="true">已移除</option></select>
  </div>
}
