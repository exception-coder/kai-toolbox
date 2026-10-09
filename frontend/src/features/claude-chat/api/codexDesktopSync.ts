import { http } from '@/lib/api'

export interface CodexNativeProject { id: string; name: string; roots: string[] }
export interface CodexNativeThread {
  id: string; title: string; cwd: string; projectId: string | null; model: string | null
  reasoningEffort: string | null; createdAt: number; updatedAt: number; source: string
}
export interface CodexProjectPage {
  codexHome: string; data: CodexNativeProject[]; nextCursor: string | null; fetchedAt: number
}
export interface CodexThreadPage {
  codexHome: string; previewToken: string
  data: { thread: CodexNativeThread; importedSessionId: string | null; unavailableReason: string | null }[]
  nextCursor: string | null; project: CodexNativeProject | null; projectMatch?: 'native' | 'directory' | null; fetchedAt: number
}
export interface CodexImportResult {
  added: number; reused: number; sessions: { sessionId: string; threadId: string; title: string }[]
}
function query(home: string, cursor?: string, projectId?: string) {
  const params = new URLSearchParams({ codexHome: home })
  if (cursor) params.set('cursor', cursor)
  if (projectId) params.set('projectId', projectId)
  return params.toString()
}
export function listCodexNativeProjects(home: string, cursor?: string, signal?: AbortSignal) {
  return http<CodexProjectPage>(`/claude-chat/codex/desktop/projects?${query(home, cursor)}`, { signal })
}
export function listCodexNativeThreads(home: string, cursor?: string, projectId?: string, signal?: AbortSignal) {
  return http<CodexThreadPage>(`/claude-chat/codex/desktop/threads?${query(home, cursor, projectId)}`, { signal })
}
export function importCodexNativeThreads(previewToken: string, threadIds: string[]) {
  return http<CodexImportResult>('/claude-chat/codex/desktop/import', {
    method: 'POST', body: JSON.stringify({ previewToken, threadIds }), signal: AbortSignal.timeout(30_000),
  })
}
