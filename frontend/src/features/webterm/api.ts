import { http } from '@/lib/api'

export interface ClaudeSessionView {
  id: string
  cwd: string
  shell: string
  title: string | null
  startedAt: number
  lastSeenAt: number
  /** 后端是否仍在跑这条会话对应的 PTY。非 null = 可以直接 attach 接回原终端。 */
  liveSessionId: string | null
}

export interface RegisterClaudeSessionRequest {
  cwd: string
  shell: string
  title?: string | null
}

export function listClaudeSessions() {
  return http<ClaudeSessionView[]>('/webterm/claude-sessions')
}

export function upsertClaudeSession(req: RegisterClaudeSessionRequest) {
  return http<ClaudeSessionView>('/webterm/claude-sessions', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function deleteClaudeSession(id: string) {
  return http<void>(`/webterm/claude-sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
