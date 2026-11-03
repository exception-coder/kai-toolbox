import { useEffect } from 'react'
import { Plus, RefreshCw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUser } from '@/lib/auth'
import type { CommunicationReference } from '../../api/communicationJournal'
import { CommunicationEditor } from './CommunicationEditor'
import { JournalRecordList } from './JournalRecordList'
import { useCommunicationJournal, type CommunicationJournal } from './useCommunicationJournal'
import { useJournalEditor } from './useJournalEditor'
import { useJournalActions } from './useJournalActions'

interface Props {
  sessionId: string; sessionTitle: string; readOnly?: boolean; initialRecordId?: string; onClose?: () => void
  onReference: (sessionId: string, material: CommunicationReference) => Promise<void>
}
export default function SessionCommunicationWorkspace(props: Props) {
  return <BoundCommunicationWorkspace key={`${getUser()?.userId ?? 'local'}:${props.sessionId}`} {...props} />
}

/** 查询、草稿和迟到的写入结果始终绑定当前服务器会话。 */
function BoundCommunicationWorkspace({ sessionId, sessionTitle, readOnly = false, initialRecordId, onReference, onClose }: Props) {
  const journal = useCommunicationJournal(sessionId, initialRecordId)
  const editor = useJournalEditor(journal, readOnly), actions = useJournalActions(journal, { readOnly, onReference })
  const { userScope, notice, error, setNotice, setError, list, refresh } = journal
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(timer)
  }, [notice, setNotice])
  return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`开发待办 · ${sessionTitle}`}>
    <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
      <div className="min-w-0"><h1 className="text-lg font-semibold">开发待办 <span className="text-sm font-normal text-[var(--color-muted-foreground)]">{list.data?.total ?? ''}</span></h1>
        <p className="truncate text-xs text-[var(--color-muted-foreground)]" title={sessionTitle}>{sessionTitle}{readOnly ? ' · 已锁定，仅可查看' : ''}</p></div>
      <div className="flex shrink-0 items-center gap-1">
        <Button id={`communication-new-${sessionId}`} className="min-h-11 text-sm" disabled={readOnly || actions.busy} onClick={editor.start}><Plus />{editor.draft ? '继续草稿' : '新增待办'}</Button>
        {onClose && <Button variant="ghost" className="size-11 p-0" aria-label="关闭开发待办" onClick={onClose}><X /></Button>}
      </div>
    </header>
    <JournalFilters journal={journal} busy={actions.busy} />
    {error && <div className="flex shrink-0 items-start gap-2 border-b px-4 py-1 text-xs" role="alert">
      <p className="min-w-0 flex-1 py-2">{error}</p><Button variant="ghost" className="min-h-11" onClick={() => { setError(''); refresh() }}>刷新核对</Button></div>}
    <JournalRecordList journal={journal} editor={editor} actions={actions} readOnly={readOnly} sessionTitle={sessionTitle} />
    {notice && <div role="status" className="absolute inset-x-4 bottom-3 z-10 flex items-center gap-2 rounded-md border bg-[var(--color-background)] px-3 py-2 text-xs shadow-sm">
      <span className="min-w-0 flex-1">{notice}</span><button className="flex size-8 shrink-0 items-center justify-center" aria-label="关闭提示" onClick={() => setNotice('')}><X className="size-4" /></button></div>}
    {editor.draft && <CommunicationEditor key={editor.draft.id} sessionId={sessionId} sessionTitle={sessionTitle} userScope={userScope} draft={editor.draft} open={editor.open} saving={editor.saving} error={editor.error}
      onChange={editor.change} onOpenChange={editor.setOpen} onSave={() => void editor.save()} storageAvailable={editor.storageAvailable} onDiscard={editor.discard} readOnly={readOnly} />}
  </div>
}

function JournalFilters({ journal, busy }: { journal: CommunicationJournal; busy: boolean }) {
  const { search, setSearch, filter, updateFilter, list, refresh } = journal
  return <div className="shrink-0 px-4">
    <div className="flex gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3"><Search className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
        <input aria-label="搜索当前会话待办" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} placeholder="搜索待办内容" /></label>
      <Button variant="ghost" className="size-11 shrink-0 p-0" aria-label="刷新开发待办" disabled={list.isFetching || busy} onClick={refresh}><RefreshCw className={list.isFetching ? 'animate-spin' : ''} /></Button>
    </div>
    <div className="mt-1 flex border-b" role="group" aria-label="待办状态筛选">
      {([['pending', '待办'], ['completed', '已完成'], ['all', '全部']] as const).map(([status, label]) => <button key={status} type="button"
        aria-pressed={!filter.removed && filter.status === status} disabled={busy}
        className="min-h-11 flex-1 border-b-2 border-transparent px-2 text-sm aria-pressed:border-[var(--color-primary)] aria-pressed:font-medium aria-pressed:text-[var(--color-primary)] disabled:opacity-50"
        onClick={() => updateFilter({ status, removed: false })}>{label}</button>)}
    </div>
  </div>
}
