import { ApiError, authFetch, http } from '@/lib/api'
import type { UploadedAttachment } from '../api'

export interface CommunicationInput {
  title: string; occurredAt: number; source: string; participants: string; sourceUrl: string
  originalText: string; notes: string; attachmentIds: string[]; expectedVersion: number
}
export interface CommunicationRecord extends Omit<CommunicationInput, 'expectedVersion'> {
  id: string; sessionId: string; version: number; deletedAt: number | null; createdAt: number; updatedAt: number
}
export interface CommunicationSummary {
  id: string; title: string; occurredAt: number; source: string; participants: string
  excerpt: string; notesExcerpt: string; imageCount: number; version: number; deletedAt: number | null; updatedAt: number
}
export interface CommunicationDetail {
  record: CommunicationRecord
  images: Omit<UploadedAttachment, 'path'>[]
}
export interface CommunicationPage { records: CommunicationSummary[]; total: number; page: number; pageSize: number }
export interface CommunicationFilter { q: string; order: 'asc' | 'desc'; notes: 'all' | 'with' | 'without'; removed: boolean; page: number }
export interface CommunicationReference {
  records: CommunicationRecord[]
  attachments: (UploadedAttachment & { recordId: string })[]
}

const root = (sid: string) => `/claude-chat/sessions/${encodeURIComponent(sid)}/communications`
export const communicationImagePath = (sid: string, id: string, imageId: string) =>
  `${root(sid)}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(imageId)}`

export function listCommunications(sid: string, filter: CommunicationFilter, signal?: AbortSignal) {
  const query = new URLSearchParams(Object.entries(filter).map(([key, value]) => [key, String(value)]))
  return http<CommunicationPage>(`${root(sid)}?${query}`, { signal })
}
export function getCommunication(sid: string, id: string, signal?: AbortSignal) {
  return http<CommunicationDetail>(`${root(sid)}/${encodeURIComponent(id)}`, { signal })
}
export function saveCommunication(sid: string, id: string, input: CommunicationInput) {
  return http<CommunicationDetail>(`${root(sid)}/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(input), signal: AbortSignal.timeout(30000),
  })
}
export function removeCommunication(sid: string, id: string, expectedVersion: number, removed: boolean) {
  return http<CommunicationDetail>(`${root(sid)}/${encodeURIComponent(id)}/removed`, {
    method: 'POST', body: JSON.stringify({ expectedVersion, removed }), signal: AbortSignal.timeout(30000),
  })
}
export function referenceCommunications(sid: string, recordIds: string[]) {
  return http<CommunicationReference>(`${root(sid)}/reference`, {
    method: 'POST', body: JSON.stringify({ recordIds }), signal: AbortSignal.timeout(30000),
  })
}
export async function uploadCommunicationImage(sid: string, file: File): Promise<UploadedAttachment> {
  const data = new FormData(); data.append('file', file)
  const response = await authFetch(`${root(sid)}/attachments`, { method: 'POST', body: data, signal: AbortSignal.timeout(120000) })
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const message = payload && typeof payload === 'object' && 'message' in payload ? String(payload.message) : '截图上传失败，请重试。'
    throw new ApiError(response.status, payload, message)
  }
  return response.json()
}
export async function loadCommunicationImage(sid: string, id: string, imageId: string, signal?: AbortSignal) {
  const response = await authFetch(communicationImagePath(sid, id, imageId), { signal })
  if (!response.ok) throw new Error('图片无法读取，可重试或编辑记录移除失效图片。')
  return response.blob()
}

export function communicationError(error: unknown, writing = false): string {
  if (error instanceof ApiError) return error.status === 404
    ? '沟通流水暂不可用：服务可能尚未加载此能力，或记录已不存在。请刷新后重试。'
    : error.message
  if (error instanceof Error && /Timeout|Abort|fetch|network/i.test(error.name + error.message)) return writing
    ? '结果尚未确认，草稿已保留。请先刷新核对；保存重试会复用同一记录编号。'
    : '读取失败，请检查连接后重试。'
  return error instanceof Error ? error.message : '操作失败，请重试。'
}

export function communicationReferenceText(reference: CommunicationReference) {
  return reference.records.map(row => {
    const link = `/tools/claude-chat?${new URLSearchParams({ sessionId: row.sessionId, view: 'communications', recordId: row.id })}`
    return [
      `沟通资料：${row.title}`,
      `记录 ID：${row.id}\n回看：${link}`,
      `沟通时间：${new Date(row.occurredAt).toLocaleString()}${row.source ? ` · 来源：${row.source}` : ''}${row.participants ? ` · 参与人：${row.participants}` : ''}`,
      row.sourceUrl ? `来源链接：${row.sourceUrl}` : '',
      row.originalText ? `沟通原文：\n${row.originalText}` : '',
      row.notes ? `用户整理备注（待结合原文核对）：\n${row.notes}` : '',
      row.attachmentIds.length ? `原始截图：${row.attachmentIds.join('、')}` : '',
    ].filter(Boolean).join('\n\n')
  }).join('\n\n---\n\n')
}
