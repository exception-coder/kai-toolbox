import { http } from '@/lib/api'

export interface BackendGrant {
  clientId: string
  appId: string
  tenantId: string
  projectIds: string[]
  version: number
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
  expiresAt: number
  changedBy: string
  changedAt: number
}
export interface BackendManagement {
  enabled: boolean
  clients: BackendGrant[]
  projects: { id: string; name: string }[]
  truncated: boolean
}
export interface BackendCredential {
  clientId: string
  clientSecret: string
  appId: string
  tenantId: string
  expiresAt: number
  version: number
}
export interface BackendGrantInput {
  appId: string
  tenantId: string
  projectIds: string[]
  expiresAt: number
}

const root = '/fore-consult/backend-clients'
export const getBackendManagement = (q = '') => http<BackendManagement>(`${root}?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
// Call directly from the sheet: one-time credentials must never enter a Query mutation cache.
export const createBackendGrant = (input: BackendGrantInput, intentKey: string) => http<BackendCredential>(root, { method: 'POST', headers: { 'Idempotency-Key': intentKey }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) })
export const rotateBackendGrant = (id: string, expiresAt: number) => http<BackendCredential>(`${root}/${encodeURIComponent(id)}/rotate`, { method: 'POST', body: JSON.stringify({ expiresAt }), signal: AbortSignal.timeout(15000) })
export const revokeBackendGrant = (id: string) => http<{ revoked: boolean }>(`${root}/${encodeURIComponent(id)}/revoke`, { method: 'POST', signal: AbortSignal.timeout(15000) })

export function isBackendBaseUrl(value: string) {
  try {
    const url = new URL(value)
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  } catch { return false }
}

export function backendEnvironment(baseUrl: string, value: BackendCredential) {
  return `FORGE_BASE_URL=${new URL(baseUrl).origin}\nFORGE_CLIENT_ID=${value.clientId}\nFORGE_CLIENT_SECRET=${value.clientSecret}\nFORGE_TENANT_ID=${value.tenantId}\n`
}

export function defaultGrantDate() {
  const date = new Date(Date.now() + 30 * 86400000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const grantExpiry = (date: string) => new Date(`${date}T23:59:59`).getTime()

interface GrantIntent { key: string; input: BackendGrantInput }
const intentStorage = (owner: number) => `forge.consult.grant-intent.${owner}`

/** Only nonsecret draft data and a request UUID survive refresh; no credential is stored. */
export function pendingGrantIntent(owner: number): GrantIntent | null {
  try {
    const raw = sessionStorage.getItem(intentStorage(owner))
    if (!raw || raw.length > 12000) return null
    const value = JSON.parse(raw) as GrantIntent
    const input = value.input
    if (!/^[0-9a-f-]{36}$/i.test(value.key) || !input || typeof input.appId !== 'string' || typeof input.tenantId !== 'string'
      || !Array.isArray(input.projectIds) || input.projectIds.length > 8 || !input.projectIds.every(id => typeof id === 'string')
      || !Number.isFinite(input.expiresAt) || !Number.isFinite(new Date(input.expiresAt).getTime())) return null
    return { key: value.key, input: { appId: input.appId, tenantId: input.tenantId, projectIds: input.projectIds, expiresAt: input.expiresAt } }
  } catch { return null }
}

export function rememberGrantIntent(owner: number, input: BackendGrantInput) {
  const previous = pendingGrantIntent(owner)
  const key = previous && JSON.stringify(previous.input) === JSON.stringify(input) ? previous.key : crypto.randomUUID()
  sessionStorage.setItem(intentStorage(owner), JSON.stringify({ key, input }))
  return key
}

export function forgetGrantIntent(owner: number, key: string) {
  try { if (pendingGrantIntent(owner)?.key === key) sessionStorage.removeItem(intentStorage(owner)) }
  catch { /* Nonsecret intent may remain; a replay will be refused by the server. */ }
}
