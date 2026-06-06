import { http } from '@/lib/api'

export interface ConfigBlockSummary {
  id: string
  name: string
}

export interface ConfigEntry {
  key: string
  value: string | null
  overridden: boolean
}

export interface ConfigBlockView {
  id: string
  name: string
  entries: ConfigEntry[]
}

export function listConfigBlocks() {
  return http<{ blocks: ConfigBlockSummary[] }>('/config/blocks')
}

export function getConfigBlock(id: string) {
  return http<ConfigBlockView>(`/config/blocks/${encodeURIComponent(id)}`)
}

/** 提交覆盖（仅传改动的 key），不重启即生效。 */
export function updateConfigBlock(id: string, overrides: Record<string, string>) {
  return http<ConfigBlockView>(`/config/blocks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ overrides }),
  })
}

/** 重置该块覆盖，回落 yml 默认。 */
export function resetConfigBlock(id: string) {
  return http<ConfigBlockView>(`/config/blocks/${encodeURIComponent(id)}/overrides`, {
    method: 'DELETE',
  })
}
