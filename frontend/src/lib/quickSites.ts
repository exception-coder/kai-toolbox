import { http } from '@/lib/api'

export type QuickSiteOpenMode = 'POPUP' | 'TAB' | 'CURRENT'
export type QuickSiteWindowBehavior = 'STANDARD' | 'CONTROLLED' | 'AUTO'

/** 快捷入口公开给其它功能复用的只读站点契约。 */
export interface QuickSiteSummary {
  id: string
  title: string
  siteUrl: string
  groupName: string
  icon: string
  openMode: QuickSiteOpenMode
  windowBehavior: QuickSiteWindowBehavior
  windowWidth: number
  windowHeight: number
  sortOrder: number
  pinned: boolean
  enabled: boolean
  openCount: number
  lastOpenedAt: number | null
  createdAt: number
  updatedAt: number
}

/** 获取快捷入口维护的全部站点。 */
export function listQuickSiteSummaries() {
  return http<QuickSiteSummary[]>('/quick-launch/sites')
}

/** 记录从其它功能打开快捷站点的使用次数。 */
export function recordQuickSiteSummaryOpened(id: string) {
  return http<void>(`/quick-launch/sites/${encodeURIComponent(id)}/opened`, { method: 'POST' })
}
