import { useRef, useState } from 'react'
import { communicationError, completeCommunication, referenceCommunications, removeCommunication, type CommunicationReference } from '../../api/communicationJournal'
import type { CommunicationJournal } from './useCommunicationJournal'

type Target = { id: string; version: number }
export function useJournalActions(journal: CommunicationJournal, options: {
  readOnly: boolean; onReference: (sid: string, material: CommunicationReference) => Promise<void>
}) {
  const { sessionId, detail, setSelectedId, selection, setSelection, setNotice, setError, refresh, alive } = journal
  const [busy, setBusy] = useState(false), running = useRef(false)
  const begin = () => {
    if (running.current || options.readOnly) return false
    running.current = true; setBusy(true); setError(''); return true
  }
  const finish = () => { running.current = false; if (alive.current) setBusy(false) }
  const remove = async (removed: boolean, target: Target | undefined = detail.data?.record) => {
    if (!target || !begin()) return
    try {
      await removeCommunication(sessionId, target.id, target.version, removed)
      refresh()
      if (alive.current) { setSelectedId(''); setSelection(ids => ids.filter(id => id !== target.id)); setNotice(removed ? '已移除，可在「已移除」中恢复。' : '记录已恢复。') }
    } catch (reason) { if (alive.current) setError(communicationError(reason, true)) }
    finally { finish() }
  }
  // 分批写入使用每条记录的版本；部分成功时保留未完成选择，不把整批误报为成功。
  const complete = async (targets: Target[], completed: boolean) => {
    if (!targets.length || !begin()) return
    const succeeded: string[] = []
    try {
      for (const target of targets) {
        if (!alive.current) break
        await completeCommunication(sessionId, target.id, target.version, completed)
        succeeded.push(target.id)
      }
      if (alive.current) setNotice(`已${completed ? '完成' : '恢复为待办'} ${succeeded.length} 条。`)
    } catch (reason) {
      if (alive.current) setError(`${succeeded.length ? `已处理 ${succeeded.length} 条；其余未确认。` : ''}${communicationError(reason, true)}`)
    } finally {
      refresh()
      if (alive.current) {
        setSelection(ids => ids.filter(id => !succeeded.includes(id)))
        setSelectedId(id => succeeded.includes(id) ? '' : id)
      }
      finish()
    }
  }
  const quote = async (ids: string[]) => {
    if (!ids.length || !begin()) return
    try {
      const material = await referenceCommunications(sessionId, ids)
      if (alive.current) {
        await options.onReference(sessionId, material)
        if (alive.current) setNotice('已写入草稿，未发送。')
      }
    } catch (reason) { if (alive.current) setError(communicationError(reason, true)) }
    finally { finish() }
  }
  const toggle = (id: string) => {
    if (selection.includes(id)) setSelection(ids => ids.filter(value => value !== id))
    else if (selection.length < 5) setSelection(ids => [...ids, id])
    else setNotice('一次最多处理 5 条，请分批整理。')
  }
  return { busy, remove, complete, quote, toggle }
}
export type JournalActions = ReturnType<typeof useJournalActions>
