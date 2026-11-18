import { http } from '@/lib/api'

export interface SessionReader { id: number; username: string; realName: string | null }
export interface SessionReaderGrant extends SessionReader { expiresAt: number | null }
export interface SharedSession { id: string; title: string | null; engine: string | null; lastSeenAt: number }
export interface SharedMessage { id: string; kind: string; text: string | null; ts: number | null }
export interface SharedMessages {
  items: SharedMessage[]; nextCursor: string | null; transcriptMissing: boolean; historyGap: string | null
}

const sharing = (id: string) => `/claude-chat/sessions/${encodeURIComponent(id)}/sharing`
export const listSessionReaders = (id: string) => http<SessionReaderGrant[]>(sharing(id))
export const searchSessionRecipients = (id: string, query: string, signal?: AbortSignal) =>
  http<SessionReader[]>(`${sharing(id)}/recipients?q=${encodeURIComponent(query)}`, { signal })
export const grantSessionReader = (id: string, userId: number, hours: number) =>
  http<void>(`${sharing(id)}/${userId}/temporary?hours=${hours}`, { method: 'PUT' }, 'empty')
export const revokeSessionReader = (id: string, userId: number) =>
  http<void>(`${sharing(id)}/${userId}`, { method: 'DELETE' }, 'empty')
export const listSharedSessions = () => http<SharedSession[]>('/claude-chat/shared-sessions')
export const getSharedSession = (id: string) => http<SharedSession>(`/claude-chat/shared-sessions/${encodeURIComponent(id)}`)
export const getSharedMessages = (id: string, cursor?: string) => http<SharedMessages>(
  `/claude-chat/shared-sessions/${encodeURIComponent(id)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
export const sharedSessionPath = (id: string) => `/tools/claude-chat/shared/${encodeURIComponent(id)}`
