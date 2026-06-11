import { http, authFetch } from '@/lib/api'

export interface AttachmentView {
  id: string
  fileName: string
  mimeType: string | null
  sizeBytes: number
}

export interface NoteView {
  id: string
  rawText: string
  category: string
  categoryLabel: string
  title: string
  dueTime: string | null
  amount: number | null
  tags: string[]
  confidence: number
  needsReview: boolean
  status: string
  createdAt: number
  attachments: AttachmentView[]
}

export interface CaptureResponse {
  degraded: boolean
  items: NoteView[]
}

/** 记录态：自由文本 → 分类抽取 → 落库 */
export function captureNote(text: string): Promise<CaptureResponse> {
  return http<CaptureResponse>('/ai-secretary/capture', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

/** 时间轴：最近的记录 */
export function listNotes(limit = 100): Promise<NoteView[]> {
  return http<NoteView[]>(`/ai-secretary/notes?limit=${limit}`)
}

/** 语音：上传录音 → 后端转写成文本 → 分类落库（multipart） */
export async function captureVoice(blob: Blob): Promise<CaptureResponse> {
  const fd = new FormData()
  fd.append('audio', blob, 'voice.webm')
  const res = await authFetch('/ai-secretary/capture/voice', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`语音上传失败：HTTP ${res.status}`)
  return res.json() as Promise<CaptureResponse>
}

/** 附件：上传文件（可带文本说明）→ 落盘并关联 note（multipart） */
export async function captureUpload(text: string, files: File[]): Promise<CaptureResponse> {
  const fd = new FormData()
  if (text.trim()) fd.append('text', text.trim())
  for (const f of files) fd.append('files', f)
  const res = await authFetch('/ai-secretary/capture/upload', { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`附件上传失败：HTTP ${res.status}`)
  return res.json() as Promise<CaptureResponse>
}
