// 与后端 tool-video-condense 的 REST/SSE 契约对齐（见 视频智能变速-api-current.md）

export type JobStatus =
  | 'PENDING' | 'ANALYZING' | 'ANALYZED' | 'RENDERING' | 'DONE' | 'FAILED' | 'CANCELLED'

export type SegmentType =
  | 'NORMAL' | 'TYPING' | 'STREAMING' | 'WAITING' | 'KEY_MOMENT' | 'FREEZE'

export interface SegmentView {
  start: number
  end: number
  speed: number
  /** 后端枚举名；前端仅展示 */
  type: string
  /** 活动度 0~1，仅展示，渲染只认 speed */
  score: number
}

export interface JobView {
  jobId: string
  status: JobStatus
  inputPath: string
  durationSec: number | null
  /** 0~1，仅 ANALYZING/RENDERING 有意义 */
  progress: number
  segments: SegmentView[]
  error: string | null
}
