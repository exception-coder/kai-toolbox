import { http, authFetch, subscribeSse, type SseHandlers } from '@/lib/api'
import type {
  AttachmentView,
  ConversationView,
  CreateConversationBody,
  MessagePage,
  ImageGenResult,
  ModelsView,
  SendMessageBody,
  UpdateConversationBody,
  UsageInfo,
  VideoTask,
} from './types'

const BASE = '/ai-chat'

export function fetchModels(refresh = false): Promise<ModelsView> {
  return http<ModelsView>(`${BASE}/models${refresh ? '?refresh=true' : ''}`)
}

/** 当前 key 用量（已用额度 + 令牌信息）。 */
export function fetchUsage(): Promise<UsageInfo> {
  return http<UsageInfo>(`${BASE}/usage`)
}

/** 绘图：同步返回图片地址。 */
export function generateImages(body: { model: string; prompt: string; size?: string; n?: number }): Promise<ImageGenResult> {
  return http<ImageGenResult>(`${BASE}/images`, { method: 'POST', body: JSON.stringify(body) })
}

/** 视频：提交任务（异步），返回 task。 */
export function submitVideo(body: { model: string; prompt: string; seconds?: string; size?: string }): Promise<VideoTask> {
  return http<VideoTask>(`${BASE}/videos`, { method: 'POST', body: JSON.stringify(body) })
}

/** 视频：轮询任务状态。 */
export function getVideoTask(id: string): Promise<VideoTask> {
  return http<VideoTask>(`${BASE}/videos/${encodeURIComponent(id)}`)
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

/** 探测 ASR（faster-whisper）是否就绪，用于启用/禁用麦克风按钮。 */
export async function sttAvailable(): Promise<boolean> {
  try {
    const res = await authFetch(`${BASE}/stt/available`)
    if (!res.ok) return false
    const j = await res.json()
    return !!j.available
  } catch {
    return false
  }
}

/** 录音 blob 上传转写为文本（raw body）。 */
export async function transcribe(audio: Blob, language = 'auto'): Promise<string> {
  const res = await authFetch(`${BASE}/stt?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'application/octet-stream' },
    body: audio,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const p = await res.json()
      if (p && typeof p.message === 'string') msg = p.message
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  const j = await res.json()
  return (j.text as string) ?? ''
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
