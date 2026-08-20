export interface SessionHistoryRequestToken {
  requestId: number
  sessionId: string | null
}

/** 历史分页属于交互型请求，不能无限占用会话级加载锁。 */
export const SESSION_HISTORY_PAGE_TIMEOUT_MS = 20_000

export function isCurrentSessionHistoryRequest(
  token: SessionHistoryRequestToken,
  activeRequestId: number,
  currentSessionId: string | null,
): boolean {
  return token.requestId === activeRequestId && token.sessionId === currentSessionId
}

export function sessionHistoryLoadErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : ''
  if (name === 'TimeoutError' || name === 'AbortError') {
    return '加载更早消息超时，请点击重试'
  }
  return '加载更早消息失败，请点击重试'
}

/**
 * 后端明确返回终点、空页或游标没有向前推进，都必须收口。
 * 后两种情况可避免异常分页响应让顶部反复请求同一页。
 */
export function isSessionHistoryPageExhausted(
  itemCount: number,
  previousBefore: number | null,
  nextBefore: number | null,
): boolean {
  return nextBefore == null
    || nextBefore <= 0
    || itemCount === 0
    || (previousBefore != null && nextBefore === previousBefore)
}
