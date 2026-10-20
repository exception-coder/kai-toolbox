export interface SessionHistoryRequestToken {
  requestId: number
  sessionId: string | null
}

/** 历史分页属于交互型请求，不能无限占用会话级加载锁。 */
export const SESSION_HISTORY_PAGE_TIMEOUT_MS = 20_000
export type HistoryCursor = number | string | null

export function isCurrentSessionHistoryRequest(
  token: SessionHistoryRequestToken,
  activeRequestId: number,
  currentSessionId: string | null,
): boolean {
  return token.requestId === activeRequestId && token.sessionId === currentSessionId
}

export function sessionHistoryLoadErrorMessage(error: unknown, initial = false): string {
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : ''
  if (name === 'TimeoutError' || name === 'AbortError') {
    return `${initial ? '加载最近' : '加载更早'}消息超时，请点击重试`
  }
  return `${initial ? '加载最近' : '加载更早'}消息失败，请点击重试`
}

/**
 * 整数协议空页收口；字节窗口可能没有可见项，以游标是否推进决定能否继续。
 * 后端明确终点或游标重复时停止，避免顶部反复请求同一页。
 */
export function isSessionHistoryPageExhausted(
  itemCount: number,
  previousBefore: HistoryCursor,
  nextBefore: HistoryCursor,
): boolean {
  if (typeof nextBefore === 'string') return !nextBefore || nextBefore === previousBefore
  return nextBefore == null
    || nextBefore <= 0
    || itemCount === 0
    || (previousBefore != null && nextBefore === previousBefore)
}

/** 重载最近一页时替换旧历史，仅保留请求期间新产生的实时消息。 */
export function mergeResetHistoryItems(history: ChatItem[], existing: ChatItem[]): ChatItem[] {
  if (history.length === 0) return existing.filter(item => !item.id.startsWith('h'))
  const historyIds = new Set(history.map(item => item.id))
  const newestHistoryTimestamp = history.reduce<number | null>((latest, item) => {
    if (item.ts == null) return latest
    return latest == null ? item.ts : Math.max(latest, item.ts)
  }, null)
  const liveItems = existing.filter(item => {
    if (historyIds.has(item.id) || item.id.startsWith('h')) return false
    return newestHistoryTimestamp == null || item.ts == null || item.ts > newestHistoryTimestamp
  })
  return [...history, ...liveItems]
}
import type { ChatItem } from '../types'
