import { http } from '@/lib/api'
import type { ClaudeChatSessionView, HistorySessionView } from './types'

export function listSessions() {
  return http<ClaudeChatSessionView[]>('/claude-chat/sessions')
}

export function deleteSession(id: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** 列出某 cwd 在磁盘上的 Claude Code 历史会话 */
export function listHistory(cwd: string) {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  return http<HistorySessionView[]>(`/claude-chat/history${qs}`)
}

// ── 语音 / 附件：二进制传输，不走 http() 的 JSON 封装 ──────────────
const API = '/api'

async function errMessage(res: Response): Promise<string> {
  let msg = `HTTP ${res.status}`
  try {
    const j = await res.json()
    msg = (j && (j.message || j.error)) || msg
  } catch { /* 非 JSON */ }
  return msg
}

/** 探测 faster-whisper ASR 是否就绪，用于启用/禁用麦克风按钮。 */
export async function sttAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/claude-chat/stt/available`)
    if (!res.ok) return false
    const j = await res.json()
    return !!j.available
  } catch {
    return false
  }
}

/** 上传录音音频，返回转写文本。 */
export async function transcribe(audio: Blob, language = 'auto'): Promise<string> {
  const res = await fetch(`${API}/claude-chat/stt?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'application/octet-stream' },
    body: audio,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  const j = await res.json()
  return j.text ?? ''
}

export interface UploadedAttachment {
  id: string
  name: string
  mime: string
  size: number
  path: string
}

/** 上传单个附件，落盘到会话 cwd 专用目录，返回句柄。 */
export async function uploadAttachment(sessionId: string, file: File): Promise<UploadedAttachment> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API}/claude-chat/sessions/${encodeURIComponent(sessionId)}/attachments`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  return res.json()
}
