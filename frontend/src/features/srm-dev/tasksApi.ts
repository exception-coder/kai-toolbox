import { http } from '@/lib/api'

/** 开发任务状态：待开发 / 开发中 / 已完成 / 已归档。 */
export type TaskStatus = 'open' | 'developing' | 'done' | 'archived'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: '待开发',
  developing: '开发中',
  done: '已完成',
  archived: '已归档',
}

export interface DevTask {
  id: string
  title: string
  moduleName: string | null
  requirement: string | null
  owner: string | null
  status: TaskStatus
  createdAt: number
  updatedAt: number
}

/** SQL 变更登记（纯台账；executed 仅人工标记「已在环境执行」）。 */
export interface SqlChange {
  id: string
  taskId: string
  title: string | null
  dbName: string | null
  changeType: string | null
  sqlText: string
  author: string | null
  executed: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** 配置变更登记（纯台账；applied 仅人工标记「已应用」）。 */
export interface ConfigChange {
  id: string
  taskId: string
  configKey: string
  scope: string | null
  oldValue: string | null
  newValue: string | null
  remark: string | null
  applied: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface TaskDetail {
  task: DevTask
  sqlChanges: SqlChange[]
  configChanges: ConfigChange[]
}

export interface TaskInput {
  title: string
  moduleName?: string
  requirement?: string
  owner?: string
  status?: TaskStatus
}

export interface SqlChangeInput {
  title?: string
  dbName?: string
  changeType?: string
  sqlText: string
  author?: string
  executed?: boolean
  sortOrder?: number
}

export interface ConfigChangeInput {
  configKey: string
  scope?: string
  oldValue?: string
  newValue?: string
  remark?: string
  applied?: boolean
  sortOrder?: number
}

const BASE = '/claude-chat/srm-dev'

/* ===== 开发任务 ===== */
export const listTasks = () => http<DevTask[]>(`${BASE}/tasks`)
export const getTask = (id: string) => http<TaskDetail>(`${BASE}/tasks/${id}`)
export const createTask = (body: TaskInput) =>
  http<DevTask>(`${BASE}/tasks`, { method: 'POST', body: JSON.stringify(body) })
export const updateTask = (id: string, body: TaskInput) =>
  http<DevTask>(`${BASE}/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const deleteTask = (id: string) =>
  http<void>(`${BASE}/tasks/${id}`, { method: 'DELETE' })

/* ===== SQL 变更登记 ===== */
export const createSqlChange = (taskId: string, body: SqlChangeInput) =>
  http<SqlChange>(`${BASE}/tasks/${taskId}/sql`, { method: 'POST', body: JSON.stringify(body) })
export const updateSqlChange = (taskId: string, id: string, body: SqlChangeInput) =>
  http<SqlChange>(`${BASE}/tasks/${taskId}/sql/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const deleteSqlChange = (taskId: string, id: string) =>
  http<void>(`${BASE}/tasks/${taskId}/sql/${id}`, { method: 'DELETE' })

/* ===== 配置变更登记 ===== */
export const createConfigChange = (taskId: string, body: ConfigChangeInput) =>
  http<ConfigChange>(`${BASE}/tasks/${taskId}/config`, { method: 'POST', body: JSON.stringify(body) })
export const updateConfigChange = (taskId: string, id: string, body: ConfigChangeInput) =>
  http<ConfigChange>(`${BASE}/tasks/${taskId}/config/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const deleteConfigChange = (taskId: string, id: string) =>
  http<void>(`${BASE}/tasks/${taskId}/config/${id}`, { method: 'DELETE' })
