import { listQueuedMessages, type PersistedQueuedMessage } from '../api'
import type { ClaudeChatSessionView } from '../types'
import { isVibeCodingSession } from './sessionScope'

export const SESSION_BOARD_LIMIT = 20
const QUEUE_READ_CONCURRENCY = 4
const QUEUE_READ_TIMEOUT_MS = 8_000
const QUEUE_PREVIEW_LIMIT = 3
const QUEUE_PREVIEW_LENGTH = 160
const activeQueueReads = new Set<Promise<void>>()

export interface SessionBoardQueue {
  count: number
  tasks: Array<{ id: string; preview: string; attachmentCount: number; createdAt: number }>
}

/** 最近集合不沿用收藏置顶或侧栏筛选；状态筛选始终在此集合内进行。 */
export function recentBoardSessions(sessions: ClaudeChatSessionView[]): ClaudeChatSessionView[] {
  return sessions.filter(session => isVibeCodingSession(session) && !session.planExpired)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt || a.id.localeCompare(b.id))
    .slice(0, SESSION_BOARD_LIMIT)
}

export function isBoardSessionRunning(session: ClaudeChatSessionView): boolean {
  return session.status === 'RUNNING' && session.live
}

export function boardSessionState(session: ClaudeChatSessionView): string {
  if (session.status === 'RUNNING') return session.live ? '进行中' : '待恢复'
  if (session.status === 'INTERRUPTED') return '已中断'
  if (session.status === 'DONE') return '已结束'
  return session.status === 'IDLE' ? '空闲' : '状态待确认'
}

/** 校验逻辑会话归属，只保留可显示的队列摘要，不暴露隐藏指令。 */
export function projectBoardQueue(sessionId: string, messages: PersistedQueuedMessage[]): SessionBoardQueue {
  if (!Array.isArray(messages) || messages.some(message => !message || message.sessionId !== sessionId)) {
    throw new Error('队列归属与会话不一致，请重新读取')
  }
  const ordered = [...messages].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return {
    count: ordered.length,
    tasks: ordered.slice(0, QUEUE_PREVIEW_LIMIT).map(message => {
      const text = (message.displayText?.trim() || message.text?.trim() || '附件任务').replace(/\s+/g, ' ')
      return {
        id: message.id,
        preview: text.length > QUEUE_PREVIEW_LENGTH ? `${text.slice(0, QUEUE_PREVIEW_LENGTH)}…` : text,
        attachmentCount: message.attachments?.length ?? 0,
        createdAt: message.createdAt,
      }
    }),
  }
}

function waitForQueueSlot(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('查询已取消', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    void Promise.race(activeQueueReads).then(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    })
  })
}

/** 看板请求最多并发四条；离开视图取消，慢请求超时后释放名额。 */
export async function readBoardQueue(sessionId: string, signal: AbortSignal): Promise<SessionBoardQueue> {
  while (activeQueueReads.size >= QUEUE_READ_CONCURRENCY) await waitForQueueSlot(signal)
  if (signal.aborted) throw new DOMException('查询已取消', 'AbortError')

  let release!: () => void
  const slot = new Promise<void>(resolve => { release = resolve })
  activeQueueReads.add(slot)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, QUEUE_READ_TIMEOUT_MS)
  try {
    return projectBoardQueue(sessionId, await listQueuedMessages(sessionId, controller.signal))
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
    activeQueueReads.delete(slot)
    release()
  }
}
