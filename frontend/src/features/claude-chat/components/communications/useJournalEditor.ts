import { useState } from 'react'
import { communicationError, saveCommunication } from '../../api/communicationJournal'
import { editJournalDraft, journalSaveInput, newJournalDraft, readJournalDraft, writeJournalDraft, type JournalDraft } from './journalDraft'
import type { CommunicationJournal } from './useCommunicationJournal'

export function useJournalEditor(journal: CommunicationJournal, readOnly: boolean) {
  const { sessionId, userScope, alive, detail, setNotice, setError, client, queryRoot, refresh, setSelectedId, setFilter } = journal
  const [draft, setDraft] = useState(() => readJournalDraft(sessionId, userScope)), [open, setOpen] = useState(false)
  const [storageAvailable, setStorageAvailable] = useState(true), [saving, setSaving] = useState(false), [error, setSaveError] = useState('')
  const change = (value: JournalDraft | null) => {
    const available = writeJournalDraft(sessionId, value, userScope)
    if (alive.current) { setStorageAvailable(available); setDraft(value) }
  }
  const start = () => { if (!draft) change(newJournalDraft()); setOpen(true); setSaveError('') }
  const edit = () => {
    if (!detail.data) return
    if (draft && draft.id !== detail.data.record.id) { setNotice('另有未保存草稿，请先继续编辑或放弃草稿。'); setOpen(true); return }
    if (!draft) change(editJournalDraft(detail.data))
    setSaveError(''); setOpen(true)
  }
  const save = async () => {
    if (!draft || saving || readOnly) return
    if (!draft.input.originalText.trim() && !draft.input.attachmentIds.length && !draft.input.notes.trim()) {
      setSaveError('请填写内容或添加图片。'); return
    }
    const submitted = draft
    setSaving(true); setSaveError(''); setError('')
    try {
      const result = await saveCommunication(sessionId, submitted.id, journalSaveInput(submitted))
      if (JSON.stringify(readJournalDraft(sessionId, userScope)) === JSON.stringify(submitted)) writeJournalDraft(sessionId, null, userScope)
      client.setQueryData([...queryRoot, 'detail', submitted.id], result)
      refresh()
      if (alive.current) {
        setDraft(readJournalDraft(sessionId, userScope)); setOpen(false); setSelectedId(submitted.id)
        setFilter(value => ({ ...value, removed: false })); setNotice('待办已保存。')
      }
    } catch (reason) { if (alive.current) setSaveError(communicationError(reason, true)) }
    finally { if (alive.current) setSaving(false) }
  }
  const discard = () => { change(null); setOpen(false); setSaveError('') }
  return { draft, open, setOpen, saving, error, storageAvailable, change, start, edit, save, discard }
}
export type JournalEditor = ReturnType<typeof useJournalEditor>
