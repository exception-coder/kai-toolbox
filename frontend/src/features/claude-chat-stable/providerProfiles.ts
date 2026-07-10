// 第三方 Anthropic 兼容网关（如 4sapi）的「服务商档案」：本地复用配置。
// 仅用于 Claude 引擎，按会话生效（不污染官方登录）。Key 存浏览器 localStorage 明文——
// 单机单用户工具，UI 已提示。后端另按会话持久化用于 resume，token 不回传浏览器。

const STORAGE_KEY = 'kai-toolbox:claude-chat-stable:providers'

export interface ProviderProfile {
  id: string
  /** 展示名，如 "4sapi" */
  name: string
  /** Anthropic 兼容 baseURL，如 https://4sapi.com */
  baseUrl: string
  /** 网关 API Key（走 ANTHROPIC_AUTH_TOKEN） */
  key: string
  /** 默认模型名（网关挂什么填什么），新建会话时预填，可改 */
  model: string
}

function genId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `p${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadProfiles(): ProviderProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(p => p && typeof p.id === 'string' && typeof p.baseUrl === 'string')
  } catch {
    return []
  }
}

function persist(list: ProviderProfile[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* 隐私模式/配额异常忽略 */ }
}

/** 新增或更新（按 id）一条档案，返回最新列表。无 id 视为新增并补 id。 */
export function upsertProfile(p: Omit<ProviderProfile, 'id'> & { id?: string }): ProviderProfile[] {
  const list = loadProfiles()
  const id = p.id ?? genId()
  const next: ProviderProfile = { id, name: p.name.trim(), baseUrl: p.baseUrl.trim(), key: p.key.trim(), model: p.model.trim() }
  const i = list.findIndex(x => x.id === id)
  if (i >= 0) list[i] = next
  else list.push(next)
  persist(list)
  return list
}

export function removeProfile(id: string): ProviderProfile[] {
  const list = loadProfiles().filter(p => p.id !== id)
  persist(list)
  return list
}
