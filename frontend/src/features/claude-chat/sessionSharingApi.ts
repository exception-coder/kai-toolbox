import { http } from '@/lib/api'
import { matchPath } from 'react-router-dom'

export interface SessionReader { id: number; username: string; realName: string | null }
export interface SessionReaderGrant extends SessionReader { expiresAt: number | null; collaborate?: boolean }
export interface SharedSession { id: string; title: string | null; engine: string | null; lastSeenAt: number; collaborate?: boolean; projectName?: string | null }
export interface SharedMessage { id: string; kind: string; text: string | null; ts: number | null }
export interface SharedMessages {
  items: SharedMessage[]; nextCursor: string | null; transcriptMissing: boolean; historyGap: string | null
}

const sharing = (id: string) => `/claude-chat/sessions/${encodeURIComponent(id)}/sharing`
export const listSessionReaders = (id: string) => http<SessionReaderGrant[]>(sharing(id))
export const searchSessionRecipients = (id: string, query: string, signal?: AbortSignal) =>
  http<SessionReader[]>(`${sharing(id)}/recipients?q=${encodeURIComponent(query)}`, { signal })
export const grantSessionReader = (id: string, userId: number, hours: number) =>
  http<void>(`${sharing(id)}/${userId}/collaboration?hours=${hours}`, { method: 'PUT' }, 'empty')
export const revokeSessionReader = (id: string, userId: number) =>
  http<void>(`${sharing(id)}/${userId}`, { method: 'DELETE' }, 'empty')
export const listSharedSessions = () => http<SharedSession[]>('/claude-chat/shared-sessions')
export const getSharedSession = (id: string) => http<SharedSession>(`/claude-chat/shared-sessions/${encodeURIComponent(id)}`)
export const getSharedMessages = (id: string, cursor?: string) => http<SharedMessages>(
  `/claude-chat/shared-sessions/${encodeURIComponent(id)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
export const sharedSessionPath = (id: string) => `/tools/claude-chat/shared/${encodeURIComponent(id)}`
export const collaborationPath = (id: string) => `/tools/claude-chat?${new URLSearchParams({ sessionId: id, collaboration: '1' })}`

/** Only the two share entry points can substitute a session grant for menu access. */
export function resolveSharingRoute(pathname: string, search: string) {
  const shared = matchPath('/tools/claude-chat/shared/:sessionId', pathname)
  if (shared?.params.sessionId) return { id: shared.params.sessionId, collaboration: false }
  if (!matchPath('/tools/claude-chat', pathname)) return null
  const params = new URLSearchParams(search)
  const id = params.get('sessionId')?.trim()
  if (params.has('control') || params.has('prdSessionId') || params.get('collaboration') !== '1' || !id) return null
  return { id, collaboration: true }
}
