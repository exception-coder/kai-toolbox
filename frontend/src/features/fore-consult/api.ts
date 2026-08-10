import { authFetch, http } from '@/lib/api'
import { listSystemModules, listSystemWorkspaces } from '@/lib/systemCatalog'

// ── 后端 /api/fore-consult 契约（与 tool-fore-consult 的 DTO 对齐）──────────────

export interface ConsultAttRef {
  name: string
  path: string
  mime?: string | null
}

export interface ConsultTurnView {
  turnId: string
  turnIndex: number
  question: string
  answer: string
  refMenuPaths: string | null
  refGraphifyNodes: string | null
  refDomainKnowledge: string | null
  attachments: ConsultAttRef[]
  createdAt: number
}

export interface FeedbackView {
  turnIndex: number
  rating: 'GOOD' | 'BAD'
  category: string | null
  reason: string | null
  correctAnswer: string | null
}

export interface FeedbackRequest {
  rating: 'GOOD' | 'BAD'
  category?: string | null
  reason?: string | null
  correctAnswer?: string | null
}

export type ConsultOrchestrationVersion = 'v1' | 'v2' | 'v3' | 'v4'

export interface ConsultSessionView {
  sessionId: string
  userId: string | null
  creatorName: string | null
  questionTitle: string | null
  systemName: string
  systemSourcePath: string
  moduleNames: string[]
  promptSnapshot: string | null
  devSessionId: string | null
  rawReferenceJson: string | null
  parseStatus: string
  archiveStatus: string
  role: string
  engine: 'claude' | 'codex'
  model: string | null
  codexReasoningEffort: string | null
  codexSpeed: 'default' | 'fast' | null
  codexHome: string | null
  orchestrationVersion: ConsultOrchestrationVersion
  errorMsg: string | null
  createdAt: number
  endedAt: number | null
  turnCount: number
  turns: ConsultTurnView[]
  feedback: FeedbackView[]
}

export type QuestionClassification = 'FOLLOW_UP' | 'NEW_QUESTION'

export interface QuestionClassificationView {
  classification: QuestionClassification
  reason: string
}

export interface ConsultDispatchView {
  action: 'SEND' | 'START_NEW_SESSION'
  reason: string
  prompt: string | null
  pipelineVersion: string | null
  steps: Array<{ id: string; label: string; availability: 'AVAILABLE' | 'PARTIAL' | 'PLACEHOLDER' }>
  capabilityGaps: string[]
}

export function dispatchConsultQuestion(
  sessionId: string,
  question: string,
  firstQuestion?: string,
  forceFollowUp = false,
  engine: 'claude' | 'codex' = 'codex',
  signal?: AbortSignal,
) {
  return http<ConsultDispatchView>(`/fore-consult/sessions/${sessionId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ question, firstQuestion, forceFollowUp, engine }),
    signal,
  })
}

export function classifyConsultQuestion(
  sessionId: string,
  question: string,
  firstQuestion?: string,
  engine: 'claude' | 'codex' = 'codex',
  signal?: AbortSignal,
) {
  return http<QuestionClassificationView>(`/fore-consult/sessions/${sessionId}/classify-question`, {
    method: 'POST',
    body: JSON.stringify({ question, firstQuestion, engine }),
    signal,
  })
}

export function submitFeedback(sessionId: string, turnIndex: number, req: FeedbackRequest) {
  return http<FeedbackView>(`/fore-consult/sessions/${sessionId}/turns/${turnIndex}/feedback`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export interface StartSessionRequest {
  systemName: string
  systemSourcePath: string
  moduleNames: string[]
  questionTitle: string
  question: string
  role: string
  engine: 'claude' | 'codex'
  model?: string | null
  codexReasoningEffort?: string | null
  codexSpeed?: 'default' | 'fast' | null
  codexHome?: string | null
  orchestrationVersion?: ConsultOrchestrationVersion
}

export interface ArchiveTurnItem {
  turnIndex: number
  question: string
  answer: string
  refMenuPaths?: string | null
  refGraphifyNodes?: string | null
  refDomainKnowledge?: string | null
  attachments?: ConsultAttRef[]
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

export function listCodexHomes() {
  return http<string[]>('/fore-consult/codex-homes')
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

export function renameConsultQuestionTitle(id: string, title: string) {
  return http<ConsultSessionView>(`/fore-consult/sessions/${id}/question-title`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

/** 进行中增量落库（保持 PENDING）：让同一用户在其它电脑或管理员查看进行中的对话。 */
export function syncConsultTurns(id: string, req: ArchiveRequest) {
  return http<ConsultSessionView>(`/fore-consult/sessions/${id}/turns`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export interface BugExtractionSummary {
  sessionId: string
  total: number
  extracted: number
  registered: number
  skipped: number
  failed: number
}

export function extractConsultBugs(id: string, force = false) {
  return http<BugExtractionSummary>(`/fore-consult/sessions/${id}/extract-bugs?force=${force}`, {
    method: 'POST',
  })
}

export function deleteConsult(id: string) {
  return http<void>(`/fore-consult/sessions/${id}`, { method: 'DELETE' })
}

// ── 复用 claude-chat 的工作区字典（系统 + 模块），无需本模块建表 ──────────────

export interface WorkspaceList {
  roots: Array<{
    root: string
    exists: boolean
    dirs: Array<{ name: string; path: string; alias?: string | null; displayName?: string }>
  }>
  scannedAt?: string
}

export interface ProjectModules {
  modules: Array<{ name: string }>
}

export function listWorkspaces(): Promise<WorkspaceList> {
  return listSystemWorkspaces()
}

export function fetchProjectModules(path: string): Promise<ProjectModules> {
  return listSystemModules(path)
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

export function analyzeTopology(systems: string[], engine: 'claude' | 'codex') {
  return http<{ links: TopoLink[] }>('/fore-consult/topology', {
    method: 'POST',
    body: JSON.stringify({ systems, engine }),
  })
}

/** 读取已持久化的链路（页面加载时用，无需重新调引擎）。 */
export function getTopology() {
  return http<{ links: TopoLink[] }>('/fore-consult/topology')
}

// ── BUG 自动登记体系 ──────────────────────────────────────────────

export interface ConsultBugView {
  bugId: string
  consultSessionId: string | null
  systemName: string | null
  module: string | null
  role: string | null
  title: string
  type: string
  severity: string
  reproduce: string | null
  expected: string | null
  actual: string | null
  suspectArea: string | null
  evidence: string | null
  question: string | null
  answer: string | null
  aiConfidence: number | null
  refsJson: string | null
  status: string
  occurrenceCount: number
  firstSeenAt: number
  lastSeenAt: number
}

export interface RegisterBugRequest {
  consultSessionId?: string | null
  turnIndex?: number
  title: string
  type?: string
  severity?: string
  module?: string
  reproduce?: string
  expected?: string
  actual?: string
  suspectArea?: string
  confidence?: number
  question?: string
  answer?: string
  evidence?: string[]
  refs?: string[]
}

export function registerBug(req: RegisterBugRequest) {
  return http<ConsultBugView>('/fore-consult/bugs', { method: 'POST', body: JSON.stringify(req) })
}

export function listBugs() {
  return http<ConsultBugView[]>('/fore-consult/bugs')
}

export function updateBugStatus(bugId: string, status: string) {
  return http<ConsultBugView>(`/fore-consult/bugs/${bugId}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
}

export function deleteBug(bugId: string) {
  return http<void>(`/fore-consult/bugs/${bugId}`, { method: 'DELETE' })
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
