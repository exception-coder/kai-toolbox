export type OpenMode = 'POPUP' | 'TAB' | 'CURRENT'

export interface QuickSiteView {
  id: string
  title: string
  siteUrl: string
  groupName: string
  icon: string
  openMode: OpenMode
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

export interface QuickSiteUpsert {
  title: string
  siteUrl: string
  groupName?: string
  icon?: string
  openMode?: OpenMode
  windowWidth?: number
  windowHeight?: number
  sortOrder?: number
  pinned?: boolean
  enabled?: boolean
}
