import { useQuery } from '@tanstack/react-query'
import { getSessionRuntimeState } from '../api'

/** 状态边界使用独立查询代次；旧请求即使晚返回，也只能更新旧代次的缓存。 */
export function useSessionRuntimeState(sessionId: string | null, running: boolean, revision = 0) {
  return useQuery({
    queryKey: ['claude-chat-runtime-state', sessionId, revision, running],
    queryFn: ({ signal }) => getSessionRuntimeState(sessionId!, signal),
    enabled: Boolean(sessionId),
    refetchInterval: running ? 5_000 : 15_000,
    gcTime: 0,
    retry: 1,
  })
}
