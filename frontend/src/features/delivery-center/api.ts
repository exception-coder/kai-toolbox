import { http } from '@/lib/api'
import type { DeliveryOverview } from './types'

export interface DeliveryFilters {
  project?: string
  module?: string
  query?: string
}

export interface TitleSuggestion {
  shortTitle: string
  title: string
}

export interface CreatePrdDraftRequest {
  title: string
  rawInput: string
  project: string
  module: string
}

/** 根据系统、模块、需求描述和图片生成规范标题。 */
export function suggestPrdTitle(project: string, module: string, rawInput: string) {
  return http<TitleSuggestion>('/prd-clarify/title-suggestion', {
    method: 'POST',
    body: JSON.stringify({ project, module, rawInput }),
  })
}

/** 创建正式 PRD 澄清会话，交由 PRD 模块继续处理生命周期。 */
export function createPrdDraft(request: CreatePrdDraftRequest) {
  return http<{ id: string }>('/prd-clarify/sessions', {
    method: 'POST',
    body: JSON.stringify({ ...request, role: 'PRODUCT' }),
  })
}

export function getDeliveryOverview(filters: DeliveryFilters = {}) {
  const params = new URLSearchParams()
  if (filters.project) params.set('project', filters.project)
  if (filters.module) params.set('module', filters.module)
  if (filters.query) params.set('q', filters.query)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return http<DeliveryOverview>(`/prd-clarify/delivery-overview${suffix}`)
}
