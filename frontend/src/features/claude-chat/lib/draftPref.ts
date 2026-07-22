import { useCallback, useState } from 'react'

/**
 * 输入框草稿本地持久化：{ [sessionId]: 文本 }。刷新页面 / 切会话 / 切视图（主界面 ↔ 分屏
 * ↔ 悬浮窗）都各自保留、互不串扰——三处入口共用同一份 localStorage，同一个会话在哪个入口
 * 打字都不会因为切走/刷新而丢。
 */
const DRAFTS_KEY = 'kai-toolbox:claude-chat:drafts'
/** 无会话（新建面板等）时草稿的占位键。 */
export const PENDING_DRAFT_KEY = '__pending__'

function loadDrafts(): Record<string, string> {
  try {
    const o = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}') as unknown
    return o && typeof o === 'object' ? (o as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function saveDrafts(m: Record<string, string>) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(m)) } catch { /* 忽略隐私模式/配额异常 */ }
}

/** 按 key（通常是 sessionId）读写一份持久化草稿的底层 store：drafts 供上层按需 pick 具体 key。 */
export function useDraftStore(): {
  drafts: Record<string, string>
  setDraft: (key: string, v: string | ((d: string) => string)) => void
} {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts())
  const setDraft = useCallback((key: string, v: string | ((d: string) => string)) => {
    setDrafts(prev => {
      const cur = prev[key] ?? ''
      const next = typeof v === 'function' ? (v as (d: string) => string)(cur) : v
      const m = { ...prev }
      if (next) m[key] = next; else delete m[key]
      saveDrafts(m)
      return m
    })
  }, [])
  return { drafts, setDraft }
}

/**
 * 便捷封装：绑定单个 key（通常是 sessionId），返回 [draft, setDraft] 用法与 useState 一致，
 * 供只需要"当前这一个会话草稿"的调用方（SessionPane/FloatingChatWindow）直接用，
 * 不用像 ChatPage 那样自己管理 draftKey 切换逻辑。
 */
export function useDraft(key: string): [string, (v: string | ((d: string) => string)) => void] {
  const { drafts, setDraft } = useDraftStore()
  const draft = drafts[key] ?? ''
  const setThisDraft = useCallback((v: string | ((d: string) => string)) => setDraft(key, v), [key, setDraft])
  return [draft, setThisDraft]
}
