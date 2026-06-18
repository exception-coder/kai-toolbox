import { http, authFetch, subscribeSse, type SseHandlers } from '@/lib/api'
import type {
  AttachmentView,
  ConversationView,
  CreateConversationBody,
  MessagePage,
  ModelsView,
  SendMessageBody,
  UpdateConversationBody,
} from './types'

const BASE = '/ai-chat'

export function fetchModels(refresh = false): Promise<ModelsView> {
  return http<ModelsView>(`${BASE}/models${refresh ? '?refresh=true' : ''}`)
}

export function listConversations(): Promise<ConversationView[]> {
  return http<ConversationView[]>(`${BASE}/conversations`)
}

export function createConversation(body: CreateConversationBody): Promise<ConversationView> {
  return http<ConversationView>(`${BASE}/conversations`, { method: 'POST', body: JSON.stringify(body) })
}

export function updateConversation(id: string, body: UpdateConversationBody): Promise<ConversationView> {
  return http<ConversationView>(`${BASE}/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  return http<{ deleted: boolean }>(`${BASE}/conversations/${id}`, { method: 'DELETE' })
}

export function fetchMessages(id: string, before?: string, limit?: number): Promise<MessagePage> {
  const qs = new URLSearchParams()
  if (before) qs.set('before', before)
  if (limit) qs.set('limit', String(limit))
  const q = qs.toString()
  return http<MessagePage>(`${BASE}/conversations/${id}/messages${q ? `?${q}` : ''}`)
}

export function sendMessage(body: SendMessageBody): Promise<{ taskId: string }> {
  return http<{ taskId: string }>(`${BASE}/completions`, { method: 'POST', body: JSON.stringify(body) })
}

export function stopCompletion(taskId: string): Promise<{ stopped: boolean }> {
  return http<{ stopped: boolean }>(`${BASE}/completions/${taskId}/stop`, { method: 'POST' })
}

/** 订阅一次补全的 token 流。事件：token / done / error。返回关闭函数。 */
export function subscribeCompletion(taskId: string, handlers: SseHandlers): () => void {
  return subscribeSse(`${BASE}/completions/${taskId}/events`, handlers, ['token', 'done'])
}

export async function uploadAttachment(file: File): Promise<AttachmentView> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await authFetch(`${BASE}/attachments`, { method: 'POST', body: fd })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const p = await res.json()
      if (p && typeof p.message === 'string') msg = p.message
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json() as Promise<AttachmentView>
}
