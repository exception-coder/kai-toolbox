import { useState } from 'react'
import { communicationError, referenceCommunications, removeCommunication, type CommunicationReference } from '../../api/communicationJournal'
import type { CommunicationJournal } from './useCommunicationJournal'

export function useJournalActions(journal: CommunicationJournal, options: {
  readOnly: boolean; onReference: (sid: string, material: CommunicationReference) => Promise<void>
}) {
  const { sessionId, detail, selectedId, setSelectedId, selection, setSelection, setNotice, setError, refresh, alive } = journal
  const [busy, setBusy] = useState(false)
  const remove = async (removed: boolean) => {
    if (!detail.data || busy || options.readOnly) return
    setBusy(true); setError('')
    try {
      await removeCommunication(sessionId, selectedId, detail.data.record.version, removed)
      refresh()
      if (alive.current) { setSelectedId(''); setSelection(ids => ids.filter(id => id !== selectedId)); setNotice(removed ? '已移除，可在「已移除」中恢复。' : '记录已恢复。') }
    } catch (reason) { if (alive.current) setError(communicationError(reason, true)) }
    finally { if (alive.current) setBusy(false) }
  }
  const quote = async (ids: string[]) => {
    if (!ids.length || busy || options.readOnly) return
    setBusy(true); setError('')
    try {
      const material = await referenceCommunications(sessionId, ids)
      if (alive.current) await options.onReference(sessionId, material)
    } catch (reason) { if (alive.current) setError(communicationError(reason, true)) }
    finally { if (alive.current) setBusy(false) }
  }
  const toggle = (id: string) => {
    if (selection.includes(id)) setSelection(ids => ids.filter(value => value !== id))
    else if (selection.length < 5) setSelection(ids => [...ids, id])
    else setNotice('一次最多引用 5 条，请分批整理。')
  }
  return { busy, remove, quote, toggle }
}
export type JournalActions = ReturnType<typeof useJournalActions>
