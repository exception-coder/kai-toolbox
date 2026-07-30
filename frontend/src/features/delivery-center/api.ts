import { http } from '@/lib/api'
import type { DeliveryOverview } from './types'

export interface DeliveryFilters {
  project?: string
  module?: string
  query?: string
}

export function getDeliveryOverview(filters: DeliveryFilters = {}) {
  const params = new URLSearchParams()
  if (filters.project) params.set('project', filters.project)
  if (filters.module) params.set('module', filters.module)
  if (filters.query) params.set('q', filters.query)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return http<DeliveryOverview>(`/prd-clarify/delivery-overview${suffix}`)
}

