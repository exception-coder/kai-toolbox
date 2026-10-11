import { useQueries } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { fetchSessionStorage } from '../api'
import type { ClaudeChatSessionView, SessionStorageView } from '../types'

const BATCH_SIZE = 100
const REFRESH_MS = 30_000

/** 一批查询当前可见的会话；不阻塞名单，缓存包含用户及原生定位身份。 */
export function useSessionStorage(sessions: ClaudeChatSessionView[]) {
  const { user } = useAuth()
  const unique = [...new Map(sessions.map(session => [session.id, session])).values()]
    .sort((a, b) => a.id.localeCompare(b.id))
  const batches: ClaudeChatSessionView[][] = []
  for (let index = 0; index < unique.length; index += BATCH_SIZE) batches.push(unique.slice(index, index + BATCH_SIZE))
  const queries = useQueries({ queries: batches.map(batch => ({
    queryKey: ['claude-chat-session-storage', user?.userId ?? 'local', batch.map(session => [
      session.id, session.engine, session.engines, session.sdkSessionId, session.codexHome, session.cwd,
    ])],
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchSessionStorage(batch.map(session => session.id), signal),
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    retry: false,
  })) })
  const values = new Map<string, { value?: SessionStorageView; failed: boolean; loading: boolean }>()
  batches.forEach((batch, index) => {
    const query = queries[index]
    const results = new Map((query.data ?? []).map(view => [view.sessionId, view]))
    batch.forEach(session => values.set(session.id, {
      value: results.get(session.id), failed: query.isError || (!query.isPending && !results.has(session.id)),
      loading: query.isFetching,
    }))
  })
  return { values, refresh: () => queries.forEach(query => { void query.refetch() }) }
}
