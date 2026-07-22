import { authFetch, http } from '@/lib/api'

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

// ── 业务系统展示偏好（别名 + 过滤 + 排序），本模块自有，覆盖工作区项目的呈现 ──────────

export interface SystemPrefView {
  systemName: string
  systemSourcePath: string | null
  alias: string | null
  visible: boolean
  sortOrder: number
}

export interface SaveSystemPrefItem {
  systemName: string
  systemSourcePath?: string | null
  alias?: string | null
  visible?: boolean
  sortOrder?: number
}

export function listSystemPrefs() {
  return http<SystemPrefView[]>('/fore-consult/system-prefs')
}

export function saveSystemPrefs(prefs: SaveSystemPrefItem[]) {
  return http<SystemPrefView[]>('/fore-consult/system-prefs', {
    method: 'PUT',
    body: JSON.stringify({ prefs }),
  })
}

// ── 系统链路分析：调 Claude Agent 引擎 + cross-topology MCP 查系统间关系 ──────────────

export interface TopoLink {
  from: string
  to: string
  relation: string
  description: string
}

export function analyzeTopology(systems: string[]) {
  return http<{ links: TopoLink[] }>('/fore-consult/topology', {
    method: 'POST',
    body: JSON.stringify({ systems }),
  })
}

/** 读取已持久化的链路（页面加载时用，无需重新调引擎）。 */
export function getTopology() {
  return http<{ links: TopoLink[] }>('/fore-consult/topology')
}

// ── 咨询附件上传（图片/Excel/Word/Markdown/PDF），落盘返回绝对路径供引擎 Read ──────────

export interface ConsultAttachment {
  name: string
  path: string
  mime?: string | null
  size?: number
}

export async function uploadConsultAttachment(file: File, cwd?: string): Promise<ConsultAttachment> {
  const fd = new FormData()
  fd.append('file', file)
  const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  const res = await authFetch(`/fore-consult/attachments${q}`, { method: 'POST', body: fd })
  if (!res.ok) {
    let msg = `上传失败（${res.status}）`
    try {
      const j = (await res.json()) as { message?: string }
      if (j?.message) msg = j.message
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}
