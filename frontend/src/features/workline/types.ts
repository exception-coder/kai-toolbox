/** 工作线模块前端类型，与后端 /api/workline 的 DTO 对应。时间戳为 epoch millis。 */

export interface WorklineView {
  id: number
  name: string
  description: string | null
  entryCount: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface WorklineUpsert {
  name: string
  description?: string
}

export interface EntryView {
  id: number
  lineId: number
  parentId: number | null
  title: string
  coreContent: string | null
  achievement: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
  /** 明细子条目；仅顶层摘要条目填充 */
  children: EntryView[]
}

export interface EntryUpsert {
  title: string
  coreContent?: string
  achievement?: string
  /** 仅创建明细子条目时传：指向父（顶层）条目 id */
  parentId?: number
}
