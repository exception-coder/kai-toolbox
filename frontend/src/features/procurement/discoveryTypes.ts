export interface DiscoveryBatch {
  id: string; date: string; status: string; pages: number; error: string
  matched?: number; unknown?: number; create_time: string; update_time: string
  scopes?: { source: string; province: string; status: string; pages: number; seen: number; error: string }[]
}
export interface DiscoveryLink {
  url: string; title: string; date: string; source: string; province: string
  region_status: string; metadata: string; page: number
}
export interface DiscoveryLinks { items: DiscoveryLink[]; total: number; page: number; pageSize: number }
