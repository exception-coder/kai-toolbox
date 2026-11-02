import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/lib/auth'

/** One account-scoped snapshot powers both the badge and the open workspace. */
export function useRecentPlanningRuns(open: boolean) {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['claude-chat-autopilot-runs', 'quick-board', user?.userId ?? 'local'],
    queryFn: async ({ signal }) => (await import('../api')).listAutopilotRuns({ scope: 'all', limit: 8 }, signal),
    staleTime: 15_000, refetchInterval: open ? 15_000 : 30_000,
    refetchIntervalInBackground: false, retry: false,
  })
  const { refetch } = query
  useEffect(() => {
    const refresh = () => { void refetch() }
    window.addEventListener('claude-chat:autopilot-changed', refresh)
    return () => window.removeEventListener('claude-chat:autopilot-changed', refresh)
  }, [refetch])
  return query
}
