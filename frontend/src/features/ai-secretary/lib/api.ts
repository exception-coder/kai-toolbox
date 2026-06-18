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
  /** 是否已存在于向量库（实时查 Qdrant）：true=已入库 / false=未入库 / null=RAG 未开或未知 */
  vectorIndexed: boolean | null
}

export interface CaptureResponse {
  degraded: boolean
  items: NoteView[]
}

/** RAG 运行态自检 / 重建结果（字段按后端 RagStatusService / RagReindexService 透传） */
export interface RagStatus {
  enabled: boolean
  collection?: string
  collectionExists?: boolean
  points?: number
  usable?: boolean
  minScore?: number
  qdrant?: string
  embeddingModel?: string
  reindexed?: number
  hint?: string
  error?: string
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

/** 删除一条记录（连带附件） */
export function deleteNote(id: string): Promise<void> {
  return http<void>(`/ai-secretary/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** RAG 自检：向量检索是否真在工作（enabled / 集合 / 点数 / usable） */
export function ragStatus(): Promise<RagStatus> {
  return http<RagStatus>('/ai-secretary/rag/status')
}

/** RAG 对账：以库为准全量重建向量索引，修双写漂移 */
export function reindexRag(): Promise<RagStatus> {
  return http<RagStatus>('/ai-secretary/rag/reindex', { method: 'POST' })
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

// ── 长期记忆 / 用户画像 ──────────────────────────────────────────────

export interface MemoryView {
  id: string
  category: string          // PREFERENCE / BOUNDARY / PERSON
  categoryLabel: string     // 偏好 / 禁区 / 核心人物
  key: string
  value: string
  detail: string | null
  confidence: number
  status: string            // PROPOSED / ACTIVE / ARCHIVED
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface MemoryRequest {
  category?: string
  key?: string
  value?: string
  detail?: string | null
  pinned?: boolean
  status?: string
}

/** 列记忆：status=active（默认）/ proposed / archived */
export function listMemory(status: 'active' | 'proposed' | 'archived' = 'active'): Promise<MemoryView[]> {
  return http<MemoryView[]>(`/ai-secretary/memory?status=${status}`)
}

/** 手动新增（直接 active） */
export function addMemory(req: MemoryRequest): Promise<MemoryView> {
  return http<MemoryView>('/ai-secretary/memory', { method: 'POST', body: JSON.stringify(req) })
}

/** 局部更新；传 status:'ACTIVE' 即确认一条 proposed */
export function updateMemory(id: string, req: MemoryRequest): Promise<MemoryView> {
  return http<MemoryView>(`/ai-secretary/memory/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(req),
  })
}

/** 确认一条 proposed → active */
export function confirmMemory(id: string): Promise<MemoryView> {
  return updateMemory(id, { status: 'ACTIVE' })
}

/** 删除一条记忆 */
export function deleteMemory(id: string): Promise<void> {
  return http<void>(`/ai-secretary/memory/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
