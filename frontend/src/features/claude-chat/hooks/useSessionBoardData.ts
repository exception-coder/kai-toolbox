import { useQueries, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { listSessions } from '../api'
import { isBoardSessionRunning, readBoardQueue, recentBoardSessions } from '../lib/sessionBoard'

/** The floating view and the full session board share account-scoped session and queue facts. */
export function useSessionBoardData(open = true) {
  const { user } = useAuth()
  const interval = open ? 15_000 : 30_000
  const sessionQuery = useQuery({
    queryKey: ['claude-chat-sessions', 'board', user?.userId ?? 'local'],
    queryFn: listSessions,
    staleTime: 15_000, refetchInterval: interval, refetchIntervalInBackground: false, retry: false,
  })
  const recent = recentBoardSessions(sessionQuery.data ?? [])
  const queues = useQueries({ queries: recent.map(session => ({
    queryKey: ['claude-chat-session-board-queue', user?.userId ?? 'local', session.id],
    queryFn: ({ signal }: { signal: AbortSignal }) => readBoardQueue(session.id, signal),
    enabled: open, staleTime: 15_000, refetchInterval: open ? 15_000 : false,
    refetchIntervalInBackground: false, retry: false,
  })) })
  return { sessionQuery, recent, queues,
    runningCount: recent.filter(isBoardSessionRunning).length,
    queuedCount: queues.filter(queue => (queue.data?.count ?? 0) > 0).length,
    uncheckedCount: queues.filter(queue => !queue.data || queue.isError).length,
    fetching: sessionQuery.isFetching || queues.some(queue => queue.isFetching),
    refresh: () => { void sessionQuery.refetch(); queues.forEach(queue => { void queue.refetch() }) },
  }
}
