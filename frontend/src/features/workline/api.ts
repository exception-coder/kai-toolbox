import { http } from '@/lib/api'
import type { EntryUpsert, EntryView, WorklineUpsert, WorklineView } from './types'

// ---------- 工作线 ----------

export function listLines() {
  return http<WorklineView[]>('/workline/lines')
}

export function createLine(payload: WorklineUpsert) {
  return http<WorklineView>('/workline/lines', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateLine(id: number, payload: WorklineUpsert) {
  return http<WorklineView>(`/workline/lines/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteLine(id: number) {
  return http<void>(`/workline/lines/${id}`, { method: 'DELETE' })
}

// ---------- 条目 ----------

export function listEntries(lineId: number) {
  return http<EntryView[]>(`/workline/lines/${lineId}/entries`)
}

export function createEntry(lineId: number, payload: EntryUpsert) {
  return http<EntryView>(`/workline/lines/${lineId}/entries`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateEntry(id: number, payload: EntryUpsert) {
  return http<EntryView>(`/workline/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteEntry(id: number) {
  return http<void>(`/workline/entries/${id}`, { method: 'DELETE' })
}
