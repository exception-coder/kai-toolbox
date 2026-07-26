import { useCallback, useSyncExternalStore } from 'react'

/**
 * 输入框草稿本地持久化：{ [sessionId]: 文本 }。刷新页面 / 切会话 / 切视图（主界面 ↔ 分屏
 * ↔ 悬浮窗）都各自保留、互不串扰——三处入口共用同一份**模块级共享 store**（非各自 useState 副本），
 * 任一入口打字，其它入口即时同步；同一会话在哪个入口打字都不会因为切走/刷新而丢。
 */
const DRAFTS_KEY = 'kai-toolbox:claude-chat:drafts'
/** 无会话（新建面板等）时草稿的占位键。 */
export const PENDING_DRAFT_KEY = '__pending__'

function readInitial(): Record<string, string> {
  try {
    const o = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}') as unknown
    return o && typeof o === 'object' ? (o as Record<string, string>) : {}
  } catch {
    return {}
  }
}

// 模块级单一真源：所有 hook 实例共享同一份，靠订阅广播实现跨组件（主页/悬浮窗/分屏）即时同步。
let store: Record<string, string> = readInitial()
const listeners = new Set<() => void>()

function persist() {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(store)) } catch { /* 忽略隐私模式/配额异常 */ }
}

/** 兼容旧调用：整体读取当前草稿表（快照）。 */
export function loadDrafts(): Record<string, string> {
  return store
}

/** 兼容旧调用：整体覆盖写入（少用；日常改单键走 setDraftFor）。 */
export function saveDrafts(m: Record<string, string>) {
  store = m
  persist()
  listeners.forEach(l => l())
}

/** 按 key（通常 sessionId）改写单条草稿并广播。空串/清空则删除该键。 */
export function setDraftFor(key: string, v: string | ((d: string) => string)) {
  const cur = store[key] ?? ''
  const next = typeof v === 'function' ? (v as (d: string) => string)(cur) : v
  const m = { ...store }
  if (next) m[key] = next; else delete m[key]
  store = m
  persist()
  listeners.forEach(l => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** 订阅整份草稿表（跨组件即时同步）。drafts 供上层按需 pick 具体 key。 */
export function useDraftStore(): {
  drafts: Record<string, string>
  setDraft: (key: string, v: string | ((d: string) => string)) => void
} {
  const drafts = useSyncExternalStore(subscribe, () => store, () => store)
  return { drafts, setDraft: setDraftFor }
}

/**
 * 便捷封装：绑定单个 key（通常是 sessionId），返回 [draft, setDraft] 用法与 useState 一致，
 * 供只需要"当前这一个会话草稿"的调用方（SessionPane/FloatingChatWindow）直接用。
 */
export function useDraft(key: string): [string, (v: string | ((d: string) => string)) => void] {
  const { drafts } = useDraftStore()
  const draft = drafts[key] ?? ''
  const setThisDraft = useCallback((v: string | ((d: string) => string)) => setDraftFor(key, v), [key])
  return [draft, setThisDraft]
}
