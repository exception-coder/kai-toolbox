import { http, subscribeSsePost, type SseHandlers } from '@/lib/api'
import type {
  CaptureStatusView, ExecuteRequestBody, ExecutedResponse, PipelineDetail, PipelineRunDetail,
  PipelineRunSummary, PipelineStep, PipelineSummary, SaveRequestBody, SavedRequestView, SessionView,
  VarView,
} from './types'

export function listSessions() {
  return http<SessionView[]>('/browser-request/sessions')
}

export function createSession(name: string, url: string) {
  return http<SessionView>('/browser-request/sessions', {
    method: 'POST',
    body: JSON.stringify({ name, url }),
  })
}

export function openSession(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/open`, { method: 'POST' })
}

export function saveStorage(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/save`, { method: 'POST' })
}

export function clearStorage(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/clear`, { method: 'POST' })
}

export function closeSession(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/close`, { method: 'POST' })
}

export function deleteSession(id: string) {
  return http<void>(`/browser-request/sessions/${id}`, { method: 'DELETE' })
}

export function executeRequest(id: string, body: ExecuteRequestBody) {
  return http<ExecutedResponse>(`/browser-request/sessions/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ── 收藏的请求 ───────────────────────────────────────────────────────────────

export function listSavedRequests(sessionId: string) {
  return http<SavedRequestView[]>(`/browser-request/sessions/${sessionId}/saved`)
}

export function saveRequest(sessionId: string, body: SaveRequestBody) {
  return http<SavedRequestView>(`/browser-request/sessions/${sessionId}/saved`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateSavedRequest(savedId: string, body: SaveRequestBody) {
  return http<SavedRequestView>(`/browser-request/saved/${savedId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteSavedRequest(savedId: string) {
  return http<void>(`/browser-request/saved/${savedId}`, { method: 'DELETE' })
}

/** 从响应中提取一个值，写入目标 saved 的 outputs 配置 + lastExtractedValues。 */
export function extractToSaved(
  savedId: string,
  body: { name: string; jsonPath: string; responseBody: string },
) {
  return http<SavedRequestView>(`/browser-request/saved/${savedId}/extract`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ── JS 捕获 ──────────────────────────────────────────────────────────────────

export function captureStatus(sessionId: string) {
  return http<CaptureStatusView>(`/browser-request/sessions/${sessionId}/capture`)
}

export function startCapture(sessionId: string) {
  return http<CaptureStatusView>(`/browser-request/sessions/${sessionId}/capture/start`, {
    method: 'POST',
  })
}

export function stopCapture(sessionId: string) {
  return http<CaptureStatusView>(`/browser-request/sessions/${sessionId}/capture/stop`, {
    method: 'POST',
  })
}

// ── 变量池 ────────────────────────────────────────────────────────────────────

export function listVars(sessionId: string) {
  return http<VarView[]>(`/browser-request/sessions/${sessionId}/vars`)
}

export function upsertVar(sessionId: string, name: string, value: string) {
  return http<VarView>(
    `/browser-request/sessions/${sessionId}/vars/${encodeURIComponent(name)}`,
    { method: 'PUT', body: JSON.stringify({ value }) },
  )
}

export function deleteVar(sessionId: string, name: string) {
  return http<void>(
    `/browser-request/sessions/${sessionId}/vars/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  )
}

// ── Foreach 批量执行（SSE） ──────────────────────────────────────────────────

export interface ForeachBody {
  items: unknown[]
  request: ExecuteRequestBody
  aggregate?: { name: string; jsonPath: string } | null
}

/** 启动 foreach 批量执行，返回 abort 函数。 */
export function startForeach(
  sessionId: string,
  body: ForeachBody,
  handlers: SseHandlers,
): () => void {
  return subscribeSsePost(
    `/browser-request/sessions/${sessionId}/foreach`,
    body,
    handlers,
  )
}

// ── Pipeline 编排链 ──────────────────────────────────────────────────────────

export function listPipelines(sessionId: string) {
  return http<PipelineSummary[]>(`/browser-request/sessions/${sessionId}/pipelines`)
}

export function getPipeline(id: string) {
  return http<PipelineDetail>(`/browser-request/pipelines/${id}`)
}

export function createPipeline(sessionId: string, name: string, steps: PipelineStep[]) {
  return http<PipelineDetail>(`/browser-request/sessions/${sessionId}/pipelines`, {
    method: 'POST',
    body: JSON.stringify({ name, steps }),
  })
}

export function updatePipeline(id: string, name: string, steps: PipelineStep[]) {
  return http<PipelineDetail>(`/browser-request/pipelines/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, steps }),
  })
}

export function deletePipeline(id: string) {
  return http<void>(`/browser-request/pipelines/${id}`, { method: 'DELETE' })
}

/** 启动 pipeline 运行，返回 abort 函数。 */
export function runPipeline(
  id: string,
  dryRun: boolean,
  handlers: SseHandlers,
): () => void {
  return subscribeSsePost(
    `/browser-request/pipelines/${id}/run?dryRun=${dryRun ? 'true' : 'false'}`,
    {},
    handlers,
  )
}

export function listPipelineRuns(pipelineId: string, limit = 20) {
  return http<PipelineRunSummary[]>(
    `/browser-request/pipelines/${pipelineId}/runs?limit=${limit}`,
  )
}

export function getPipelineRun(runId: string) {
  return http<PipelineRunDetail>(`/browser-request/runs/${runId}`)
}
