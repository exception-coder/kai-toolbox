import type { ClaudeChatSessionView } from '../types'

/** Shared display identity for chat and project entry points; never changes the saved title. */
export function sessionDisplayName(session: Pick<ClaudeChatSessionView, 'title' | 'cwd'>): string {
  const title = session.title?.trim()
  if (title) return title
  const cwd = session.cwd.trim()
  return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || cwd || '未命名会话'
}
