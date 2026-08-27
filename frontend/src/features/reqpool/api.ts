import { http } from '@/lib/api'
import type { AgentEngine, AssignableUser, CreateReqRequest, PlanningAssessmentView, ReqItemView, ReqStatus, ReqPriority, UpdateReqRequest } from './types'

const BASE = '/reqpool'

export const listItems = (filters?: { status?: ReqStatus; project?: string; priority?: ReqPriority }) => {
  const q = new URLSearchParams()
  if (filters?.status)   q.set('status', filters.status)
  if (filters?.project)  q.set('project', filters.project)
  if (filters?.priority) q.set('priority', filters.priority)
  const qs = q.toString()
  return http<ReqItemView[]>(`${BASE}/items${qs ? '?' + qs : ''}`)
}

export const getItem = (id: string) =>
  http<ReqItemView>(`${BASE}/items/${id}`)

export interface DevelopmentAccess {
  allowed: boolean
  itemId: string
  prdSessionId: string
  devSessionId: string
}

/** ADMIN 或需求负责人进入 PRD 范围 Vibe Coding 前的权威鉴权。 */
export const getDevelopmentAccess = (prdSessionId: string) =>
  http<DevelopmentAccess>(`${BASE}/prd-sessions/${encodeURIComponent(prdSessionId)}/development-access`)

export const createItem = (req: CreateReqRequest) =>
  http<ReqItemView>(`${BASE}/items`, { method: 'POST', body: JSON.stringify(req) })

export const updateItem = (id: string, req: UpdateReqRequest) =>
  http<ReqItemView>(`${BASE}/items/${id}`, { method: 'PUT', body: JSON.stringify(req) })

export const deleteItem = (id: string) =>
  http<void>(`${BASE}/items/${id}`, { method: 'DELETE' })

export const deleteItems = async (ids: string[]) => {
  const uniqueIds = [...new Set(ids)]
  const batchSize = 20
  let deleted = 0
  for (let offset = 0; offset < uniqueIds.length; offset += batchSize) {
    const batch = uniqueIds.slice(offset, offset + batchSize)
    await Promise.all(batch.map(deleteItem))
    deleted += batch.length
  }
  return { requested: uniqueIds.length, deleted }
}

/** 当前登录用户可见的启用账号候选，只返回指派需要的最小信息。 */
export const listAssignableUsers = () =>
  http<AssignableUser[]>('/auth/users/options')

/** 通过账号 ID 绑定负责人；传 null 可解除指派。 */
export const assignItem = (id: string, userId: number | null) =>
  http<ReqItemView>(`${BASE}/items/${id}/assignee`, {
    method: 'PUT',
    body: JSON.stringify({ userId }),
  })

export const startClarify = (id: string) =>
  http<ReqItemView>(`${BASE}/items/${id}/start-clarify`, { method: 'POST' })

export const linkPrd = (id: string, prdSessionId: string) =>
  http<ReqItemView>(`${BASE}/items/${id}/link-prd`, {
    method: 'POST',
    body: JSON.stringify({ prdSessionId }),
  })

export const seedDemo = () =>
  http<string>(`${BASE}/seed`, { method: 'POST' })

/** 从 prd_session 表同步已生成的 PRD 到需求管理池（幂等，只新增缺失条目）。 */
export const syncFromPrd = () =>
  http<{ created: number; updated: number; deleted: number }>(`${BASE}/sync-from-prd`, { method: 'POST' })

/** 登记单条价值判定后台任务；响应不等待模型执行。 */
export const analyzeItem = (id: string, engine: AgentEngine) =>
  http<ReqItemView>(`${BASE}/items/${id}/analyze`, {
    method: 'POST',
    body: JSON.stringify({ engine }),
  })

/** 基于已保存的初始化规格快照重试规划评估。 */
export const retryPlanningAssessment = (id: string) =>
  http<PlanningAssessmentView>(`${BASE}/items/${id}/planning-assessment/retry`, { method: 'POST' })

/**
 * Portfolio 全局分析：把所有活跃需求一起发给 Claude，横向对比后给出相对优先级排序。
 * 真正意义上的"A 比 B 更值得先做"，而非独立评分。
 */
export const portfolioAnalyze = () =>
  http<{ summary: string; count: number }>(`${BASE}/portfolio-analyze`, { method: 'POST' })
