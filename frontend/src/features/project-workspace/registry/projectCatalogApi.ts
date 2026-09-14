import { http } from '@/lib/api'

export interface CatalogProject {
  id: string
  systemId: string
  name: string
  path: string
  root: string
  available: boolean
  excluded: boolean
  source: string
}

export const listProjectCatalog = (includeExcluded = false) =>
  http<CatalogProject[]>(`/project-catalog?includeExcluded=${includeExcluded}`)
export const setProjectExcluded = (path: string, excluded: boolean) =>
  http<void>('/project-catalog/visibility', { method: 'PUT', body: JSON.stringify({ path, excluded }) })
