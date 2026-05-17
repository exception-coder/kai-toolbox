/**
 * 与后端 {@code TaskView} (Java record) 同形。修改任一侧都要顺便同步另一侧。
 */
export interface TaskView {
  id: string
  type: 'SUBTITLE' | 'SCAN'
  title: string
  subtitle: string
  phase: string
  status: string
  /** 0~1 之间;扫描没有连续进度时为 -1 (前端按 indeterminate 渲染) */
  progress: number
  errorMsg: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  active: boolean
  /** 字幕任务关联的 scanId;扫描自身 id */
  scanId: string | null
  /** 字幕才有 */
  videoPath: string | null
}

export type TaskFilter = 'active' | 'all' | 'failed'
