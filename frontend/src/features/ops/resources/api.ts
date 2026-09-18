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
export interface ApplicationResource {
  id: string; name: string; environment: string; baseUrl: string; authType: 'NONE' | 'FORM_COOKIE' | 'JSON_BEARER'
  loginPath: string | null; username: string | null; credentialConfigured: boolean
  usernameField: string; passwordField: string; tokenJsonPath: string
  tenantHeader: string | null; tenantValue: string | null
}
export type ApplicationResourceInput = Omit<ApplicationResource, 'id' | 'credentialConfigured'> & { password?: string }
export const resourceCatalog = () => http<ResourceCatalog>('/ops/resources')
export const discoverResources = (id: string) => http<BoundResource[]>(`/ops/resources/systems/${encodeURIComponent(id)}`)
export const saveResourceBinding = (binding: Omit<ResourceBinding, 'id'>) => http<void>('/ops/resources/bindings', { method: 'PUT', body: JSON.stringify(binding) })
export const removeResourceBinding = (id: string) => http<void>(`/ops/resources/bindings/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const testResource = (id: string) => http<unknown>(`/ops/resources/bindings/${encodeURIComponent(id)}/execute`, { method: 'POST', body: JSON.stringify({ operation: 'TEST' }) })
export const listApplicationResources = () => http<ApplicationResource[]>('/ops/application-resources')
export const createApplicationResource = (value: ApplicationResourceInput) => http<ApplicationResource>('/ops/application-resources', { method: 'POST', body: JSON.stringify(value) })
export const updateApplicationResource = (id: string, value: ApplicationResourceInput) => http<ApplicationResource>(`/ops/application-resources/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(value) })
export const deleteApplicationResource = (id: string) => http<void>(`/ops/application-resources/${encodeURIComponent(id)}`, { method: 'DELETE' })
