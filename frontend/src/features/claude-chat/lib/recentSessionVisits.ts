import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { getUser, useAuth } from '@/lib/auth'
import type { ClaudeChatSessionView } from '../types'

interface SessionVisit { id: string; openedAt: number }
const LIMIT = 50
const EVENT = 'forge:recent-session-visits'
const unsaved = new Map<string, string>()
export const recentSessionVisitsKey = (userId?: number) => `forge.vibecoding.recent-session-visits:v1:${userId ?? 'local'}`

function read(key: string) {
  if (unsaved.has(key)) return unsaved.get(key)!
  try { return localStorage.getItem(key) ?? '[]' } catch { return 'unavailable' }
}

function parse(raw: string): SessionVisit[] {
  try {
    if (raw.length > 32_768) return []
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    return value.filter((item): item is SessionVisit => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256
        || typeof item.openedAt !== 'number' || !Number.isFinite(item.openedAt) || item.openedAt < 0 || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }).slice(0, LIMIT)
  } catch { return [] }
}

/** 只记录用户从导航打开会话；不写 favorite、活动时间或会话正文。 */
export function recordSessionVisit(id: string, userId = getUser()?.userId) {
  if (!id || id.length > 256) return
  const key = recentSessionVisitsKey(userId)
  const raw = JSON.stringify([{ id, openedAt: Date.now() }, ...parse(read(key)).filter(item => item.id !== id)].slice(0, LIMIT))
  try { localStorage.setItem(key, raw); unsaved.delete(key) }
  catch { unsaved.set(key, raw) }
  window.dispatchEvent(new Event(EVENT))
}

export function useRecentSessionVisits() {
  const { user } = useAuth()
  const key = recentSessionVisitsKey(user?.userId)
  const subscribe = useCallback((listener: () => void) => {
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) { unsaved.delete(key); listener() }
    }
    window.addEventListener(EVENT, listener)
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', storage) }
  }, [key])
  const raw = useSyncExternalStore(subscribe, () => read(key), () => '[]')
  const visits = useMemo(() => parse(raw), [raw])
  return { visits, warning: unsaved.has(key) || raw === 'unavailable'
    ? '最近查看顺序暂未保存，刷新后可能丢失。' : undefined }
}

/** 手动置顶优先；普通项按明确访问次序，其余沿用活动排序快照。 */
export function orderRecentSessions(sessions: ClaudeChatSessionView[], visits: SessionVisit[], compare: (a: ClaudeChatSessionView, b: ClaudeChatSessionView) => number) {
  const rank = new Map(visits.map((visit, index) => [visit.id, index]))
  return [...sessions].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))
    || (a.favorite && b.favorite ? (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
      : (rank.get(a.id) ?? LIMIT) - (rank.get(b.id) ?? LIMIT)) || compare(a, b))
}
