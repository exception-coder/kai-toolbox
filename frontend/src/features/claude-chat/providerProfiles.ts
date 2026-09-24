import { http } from '@/lib/api'

const LEGACY_STORAGE_KEY = 'kai-toolbox:claude-chat:providers'
let migration: Promise<void> | null = null

/** Redacted server-owned gateway profile; saved API Keys are never returned to the browser. */
export interface ProviderProfile {
  id: string
  name: string
  baseUrl: string
  model: string
  hasKey: boolean
}

export interface ProviderProfileInput {
  id?: string
  requestId?: string
  name: string
  baseUrl: string
  key: string
  model: string
}

interface LegacyProfile extends ProviderProfileInput {
  id: string
}

async function migrateLegacyProfiles(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return
  if (migration) return migration
  migration = (async () => {
    let profiles: LegacyProfile[]
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every(item => item && typeof item.id === 'string'
        && typeof item.name === 'string' && typeof item.baseUrl === 'string'
        && typeof item.key === 'string' && typeof item.model === 'string')) {
        throw new Error('旧服务商档案格式无效')
      }
      profiles = parsed as LegacyProfile[]
    } catch {
      throw new Error('旧浏览器服务商档案无法读取；请检查浏览器数据后重试，旧数据未删除')
    }
    await http<ProviderProfile[]>('/claude-chat/provider/profiles/import', {
      method: 'POST',
      body: JSON.stringify(profiles),
    })
    if (localStorage.getItem(LEGACY_STORAGE_KEY) === raw) localStorage.removeItem(LEGACY_STORAGE_KEY)
  })().finally(() => { migration = null })
  return migration
}

/** Import the current browser's legacy profiles once, then read the authoritative server list. */
export async function loadProfiles(): Promise<ProviderProfile[]> {
  await migrateLegacyProfiles()
  return http<ProviderProfile[]>('/claude-chat/provider/profiles')
}

export function upsertProfile(input: ProviderProfileInput): Promise<ProviderProfile> {
  const id = input.id
  return http<ProviderProfile>(id
    ? `/claude-chat/provider/profiles/${encodeURIComponent(id)}`
    : '/claude-chat/provider/profiles', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify({ requestId: input.requestId, name: input.name.trim(), baseUrl: input.baseUrl.trim(),
      key: input.key.trim(), model: input.model.trim() }),
  })
}

export function removeProfile(id: string): Promise<void> {
  return http<void>(`/claude-chat/provider/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
