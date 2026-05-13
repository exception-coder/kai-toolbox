import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteClaudeSession,
  listClaudeSessions,
  upsertClaudeSession,
  type RegisterClaudeSessionRequest,
} from '../api'

const KEY = ['webterm-claude-sessions']

export function useClaudeSessions() {
  return useQuery({
    queryKey: KEY,
    queryFn: listClaudeSessions,
    // 客户端进入 webterm 页面就拉一次；后续 mutation 会主动 invalidate
    staleTime: 30 * 1000,
  })
}

export function useUpsertClaudeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: RegisterClaudeSessionRequest) => upsertClaudeSession(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteClaudeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteClaudeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
