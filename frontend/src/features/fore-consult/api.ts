import { http } from '@/lib/api'

// ── 后端 /api/fore-consult 契约（与 tool-fore-consult 的 DTO 对齐）──────────────

export interface ConsultTurnView {
  turnId: string
  turnIndex: number
  question: string
  answer: string
  refMenuPaths: string | null
  refGraphifyNodes: string | null
  refDomainKnowledge: string | null
  createdAt: number
}

export interface ConsultSessionView {
  sessionId: string
  userId: string | null
  systemName: string
  systemSourcePath: string
  moduleNames: string[]
  promptSnapshot: string | null
  devSessionId: string | null
  rawReferenceJson: string | null
  parseStatus: string
  archiveStatus: string
  errorMsg: string | null
  createdAt: number
  endedAt: number | null
  turns: ConsultTurnView[]
}

export interface StartSessionRequest {
  systemName: string
  systemSourcePath: string
  moduleNames: string[]
  promptSnapshot: string
}

export interface ArchiveTurnItem {
  turnIndex: number
  question: string
  answer: string
  refMenuPaths?: string | null
  refGraphifyNodes?: string | null
  refDomainKnowledge?: string | null
}

export interface ArchiveRequest {
  rawReferenceJson?: string | null
  parseStatus?: string | null
  turns: ArchiveTurnItem[]
}

export function startConsult(req: StartSessionRequest) {
  return http<ConsultSessionView>('/fore-consult/sessions', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function listConsults() {
  return http<ConsultSessionView[]>('/fore-consult/sessions')
}

export function getConsult(id: string) {
  return http<ConsultSessionView>(`/fore-consult/sessions/${id}`)
}

export function linkDevSession(id: string, devSessionId: string) {
  return http<ConsultSessionView>(`/fore-consult/sessions/${id}/link-dev-session`, {
    method: 'POST',
    body: JSON.stringify({ devSessionId }),
  })
}

export function archiveConsult(id: string, req: ArchiveRequest) {
  return http<ConsultSessionView>(`/fore-consult/sessions/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export function deleteConsult(id: string) {
  return http<void>(`/fore-consult/sessions/${id}`, { method: 'DELETE' })
}

// ── 复用 claude-chat 的工作区字典（系统 + 模块），无需本模块建表 ──────────────

export interface WorkspaceList {
  roots: Array<{ root: string; exists: boolean; dirs: Array<{ name: string; path: string }> }>
  scannedAt?: string
}

export interface ProjectModules {
  modules: Array<{ name: string }>
}

export function listWorkspaces() {
  return http<WorkspaceList>('/claude-chat/workspaces')
}

export function fetchProjectModules(path: string) {
  return http<ProjectModules>(`/claude-chat/workspaces/modules?path=${encodeURIComponent(path)}`)
}
