import { getUser } from '@/lib/auth'
import type { CommunicationDetail, CommunicationInput } from '../../api/communicationJournal'

export interface JournalDraft {
  id: string; input: CommunicationInput
  images: CommunicationDetail['images']
}
const memory = new Map<string, JournalDraft>()
const draftKey = (sid: string, scope: string | number) => `forge:communication-draft:${scope}:${sid}`

/** 标签页内保留稳定创建编号，刷新后未知结果仍能安全重试。 */
export function readJournalDraft(sid: string, scope: string | number = getUser()?.userId ?? 'local'): JournalDraft | null {
  const key = draftKey(sid, scope)
  if (memory.has(key)) return memory.get(key) ?? null
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (data && typeof data === 'object' && 'id' in data && 'input' in data && 'images' in data) {
      const candidate = data as JournalDraft
      if (typeof candidate.id === 'string' && candidate.input && typeof candidate.input.title === 'string'
        && Array.isArray(candidate.input.attachmentIds) && Array.isArray(candidate.images)) {
        memory.set(key, candidate)
        return candidate
      }
    }
  } catch { return null }
  return null
}
export function writeJournalDraft(sid: string, draft: JournalDraft | null, scope: string | number = getUser()?.userId ?? 'local'): boolean {
  const key = draftKey(sid, scope)
  if (draft) memory.set(key, draft); else memory.delete(key)
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft)); else sessionStorage.removeItem(key)
    return true
  } catch { return false }
}
export function newJournalDraft(): JournalDraft {
  return { id: crypto.randomUUID(), images: [], input: {
    title: '', occurredAt: Date.now(), source: '', participants: '', sourceUrl: '',
    originalText: '', notes: '', attachmentIds: [], expectedVersion: 0,
  } }
}
export function editJournalDraft(detail: CommunicationDetail): JournalDraft {
  const { record, images } = detail
  return { id: record.id, images, input: {
    title: record.title, occurredAt: record.occurredAt, source: record.source, participants: record.participants,
    sourceUrl: record.sourceUrl, originalText: record.originalText, notes: record.notes,
    attachmentIds: record.attachmentIds, expectedVersion: record.version,
  } }
}
