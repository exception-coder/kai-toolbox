import type { ChatItem } from '../types'

export interface RecentHistoryPage {
  items: ChatItem[]
  nextBefore: number | null
}

/** 仅缓存已授权读取的最近页；不落盘、不保存整份 transcript，登录凭据变化即失效。 */
export class RecentHistoryCache {
  private scope: string | null = null
  private pages = new Map<string, { page: RecentHistoryPage; expires: number; bytes: number }>()

  constructor(private readonly maxBytes = 4 * 1024 * 1024, private readonly maxSessions = 8,
    private readonly ttlMs = 10 * 60_000) {}

  private selectScope(scope: string | null) {
    if (scope !== this.scope) {
      this.pages.clear()
      this.scope = scope
    }
  }

  get(scope: string | null, sessionId: string, now = Date.now()): RecentHistoryPage | undefined {
    this.selectScope(scope)
    const entry = this.pages.get(sessionId)
    if (!scope || !entry) return undefined
    this.pages.delete(sessionId)
    if (entry.expires <= now) return undefined
    this.pages.set(sessionId, entry)
    return entry.page
  }

  put(scope: string | null, sessionId: string, page: RecentHistoryPage, now = Date.now()) {
    this.selectScope(scope)
    this.pages.delete(sessionId)
    if (!scope) return
    const bytes = JSON.stringify(page).length * 2
    if (bytes > this.maxBytes) return
    this.pages.set(sessionId, { page, bytes, expires: now + this.ttlMs })
    let total = [...this.pages.values()].reduce((sum, entry) => sum + entry.bytes, 0)
    while (this.pages.size > this.maxSessions || total > this.maxBytes) {
      const oldest = this.pages.keys().next().value!
      total -= this.pages.get(oldest)!.bytes
      this.pages.delete(oldest)
    }
  }
}
