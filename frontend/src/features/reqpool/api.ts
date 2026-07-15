import { http } from '@/lib/api'
import type { CreateReqRequest, ReqItemView, ReqStatus, ReqPriority, UpdateReqRequest } from './types'

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

export const createItem = (req: CreateReqRequest) =>
  http<ReqItemView>(`${BASE}/items`, { method: 'POST', body: JSON.stringify(req) })

export const updateItem = (id: string, req: UpdateReqRequest) =>
  http<ReqItemView>(`${BASE}/items/${id}`, { method: 'PUT', body: JSON.stringify(req) })

export const deleteItem = (id: string) =>
  http<void>(`${BASE}/items/${id}`, { method: 'DELETE' })

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
  http<{ imported: number }>(`${BASE}/sync-from-prd`, { method: 'POST' })
