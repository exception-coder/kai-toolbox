import { http } from '@/lib/api'

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
