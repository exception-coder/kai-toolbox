import { http } from '@/lib/api'

export interface ResourceDescriptor {
  id: string; name: string; kind: string; environment: string; endpoint: string
  account: string; credentialConfigured: boolean; capabilities: string[]; configurationUrl: string
}
export interface ResourceBinding {
  id: string; systemId: string; providerId: string; resourceId: string; purpose: string; enabled: boolean
}
export interface ResourceCatalog {
  systems: { id: string; name: string }[]
  resources: { providerId: string; resource: ResourceDescriptor }[]
  bindings: ResourceBinding[]; unavailableProviders: string[]
}
export interface BoundResource { binding: ResourceBinding; resource: ResourceDescriptor | null; state: string }
export const resourceCatalog = () => http<ResourceCatalog>('/ops/resources')
export const discoverResources = (id: string) => http<BoundResource[]>(`/ops/resources/systems/${encodeURIComponent(id)}`)
export const saveResourceBinding = (binding: Omit<ResourceBinding, 'id'>) => http<void>('/ops/resources/bindings', { method: 'PUT', body: JSON.stringify(binding) })
export const removeResourceBinding = (id: string) => http<void>(`/ops/resources/bindings/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const testResource = (id: string) => http<unknown>(`/ops/resources/bindings/${encodeURIComponent(id)}/execute`, { method: 'POST', body: JSON.stringify({ operation: 'TEST' }) })
