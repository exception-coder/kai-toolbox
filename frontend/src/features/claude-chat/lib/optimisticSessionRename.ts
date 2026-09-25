import type { QueryClient } from '@tanstack/react-query'
import type { ClaudeChatSessionView } from '../types'

export const SESSION_QUERY_KEY = ['claude-chat-sessions'] as const

const pendingTitles = new Map<string, string>()

export function applyPendingSessionTitles(sessions: ClaudeChatSessionView[]): ClaudeChatSessionView[] {
  return sessions.map(session => {
    const title = pendingTitles.get(session.id)
    return title === undefined ? session : { ...session, title }
  })
}

export async function renameSessionOptimistically(
  client: QueryClient,
  id: string,
  title: string,
  persist: (id: string, title: string) => Promise<unknown>,
): Promise<void> {
  const nextTitle = title.trim()
  if (!nextTitle || pendingTitles.has(id)) return
  const previous = client.getQueryData<ClaudeChatSessionView[]>(SESSION_QUERY_KEY)
    ?.find(session => session.id === id)?.title ?? null
  if (previous === nextTitle) return
  pendingTitles.set(id, nextTitle)
  client.setQueryData<ClaudeChatSessionView[]>(SESSION_QUERY_KEY, sessions =>
    sessions?.map(session => session.id === id ? { ...session, title: nextTitle } : session))
  try {
    await client.cancelQueries({ queryKey: SESSION_QUERY_KEY })
    await persist(id, nextTitle)
  } catch (error) {
    client.setQueryData<ClaudeChatSessionView[]>(SESSION_QUERY_KEY, sessions =>
      sessions?.map(session => session.id === id && session.title === nextTitle
        ? { ...session, title: previous }
        : session))
    throw error
  } finally {
    pendingTitles.delete(id)
    await client.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
  }
}
