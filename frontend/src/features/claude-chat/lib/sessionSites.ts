import type { QuickSiteSummary } from '@/lib/quickSites'
import type { SessionCustomSite } from '../types'

export type SessionSiteSource = 'QUICK' | 'CUSTOM'

/** 会话顶栏和弹框统一使用的可打开站点契约。 */
export interface SessionLinkedSite extends QuickSiteSummary {
  sourceType: SessionSiteSource
}

/** 给全局快捷站点补充会话来源标识。 */
export function quickSiteToLinkedSite(site: QuickSiteSummary): SessionLinkedSite {
  return { ...site, sourceType: 'QUICK' }
}

/** 将会话临时站点适配为通用站点打开器所需字段。 */
export function customSiteToLinkedSite(site: SessionCustomSite): SessionLinkedSite {
  return {
    id: site.id,
    title: site.title,
    siteUrl: site.siteUrl,
    groupName: '临时站点',
    icon: 'Globe2',
    openMode: 'POPUP',
    windowBehavior: 'STANDARD',
    windowWidth: 1400,
    windowHeight: 900,
    sortOrder: 0,
    pinned: false,
    enabled: true,
    openCount: 0,
    lastOpenedAt: null,
    createdAt: 0,
    updatedAt: 0,
    sourceType: 'CUSTOM',
  }
}
