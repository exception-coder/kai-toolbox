import { http } from '@/lib/api'
import type { QuickSiteUpsert, QuickSiteView } from './types'

export function listQuickSites() {
  return http<QuickSiteView[]>('/quick-launch/sites')
}

export function createQuickSite(payload: QuickSiteUpsert) {
  return http<QuickSiteView>('/quick-launch/sites', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateQuickSite(id: string, payload: QuickSiteUpsert) {
  return http<QuickSiteView>(`/quick-launch/sites/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteQuickSite(id: string) {
  return http<void>(`/quick-launch/sites/${id}`, { method: 'DELETE' })
}

export function recordQuickSiteOpened(id: string) {
  return http<void>(`/quick-launch/sites/${id}/opened`, { method: 'POST' })
}
