// 会话分组：把某些会话归到自定义组，本地持久化（{ [sessionId]: 组名 }）。模块级 pub/sub，多处 SessionList 共享。
// 单用户本机组织偏好，故存 localStorage；会话本身仍由后端持久化，跨端可见（组归属为本机偏好）。

const KEY = 'kai-toolbox:claude-chat:session-groups'

type GroupMap = Record<string, string>

let map: GroupMap = load()
let version = 0
const listeners = new Set<() => void>()

function load(): GroupMap {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}') as unknown
    return o && typeof o === 'object' ? (o as GroupMap) : {}
  } catch {
    return {}
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* 隐私模式忽略 */ }
}

export function getSessionGroupMap(): GroupMap {
  return map
}

/** useSyncExternalStore 快照（map 原地替换，用版本号感知变化）。 */
export function getSessionGroupVersion(): number {
  return version
}

export function subscribeSessionGroups(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** 设/清某会话的分组（空/仅空白=移出分组）。 */
export function setSessionGroup(sessionId: string, group: string | null): void {
  const g = (group ?? '').trim()
  const next = { ...map }
  if (g) next[sessionId] = g
  else delete next[sessionId]
  map = next
  version += 1
  persist()
  listeners.forEach(l => { try { l() } catch { /* ignore */ } })
}

/** 现有分组名（去重、排序）。 */
export function listSessionGroups(): string[] {
  return [...new Set(Object.values(map))].filter(Boolean).sort((a, b) => a.localeCompare(b))
}
