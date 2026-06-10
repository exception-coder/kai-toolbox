import type {
  AiFlowView, CreateTaskBody, FlowAction, FlowRunResult, GenerateFlowBody, GenerateFlowResult,
  HttpCallStreamView, RecordingDetail, RecordingView,
  ReplayBody, SessionView, StartRecordingBody, TaskRunView, TaskView, UpdateTaskBody,
} from './types'

import { authEventSource, http } from '@/lib/api'
import { withAuthToken } from '@/lib/auth'

const BASE = '/browser-request'

// 统一收口：所有 JSON 请求复用共享 http()（续期 + JWT + mock + 204 + ApiError），SSE 用
// authEventSource（带 access_token）。本模块不再自建裸 fetch / 裸 EventSource，避免漏带 token
// 导致 admin-only 软鉴权静默返回空。path 不含 /api 前缀，由 http()/authEventSource 统一补。
function jsonReq<T>(path: string, init?: RequestInit): Promise<T> {
  return http<T>(path, init)
}

// ── 会话 ─────────────────────────────────────────────────────────────────

export const sessions = {
  list: () => jsonReq<SessionView[]>(`${BASE}/sessions`),
  create: (body: { name: string; url: string; engine?: string }) =>
    jsonReq<SessionView>(`${BASE}/sessions`, { method: 'POST', body: JSON.stringify(body) }),
  open: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/open`, { method: 'POST' }),
  save: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/save`, { method: 'POST' }),
  clear: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/clear`, { method: 'POST' }),
  close: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/close`, { method: 'POST' }),
  delete: (id: string) => jsonReq<void>(`${BASE}/sessions/${id}`, { method: 'DELETE' }),
  /** 该会话浏览器当前所有页签 URL（移动端确认窗口最终停在哪：空白页 / 实际站点）。 */
  pages: (id: string) => jsonReq<string[]>(`${BASE}/sessions/${id}/pages`),
  /** 实时画面截图 URL（带 access_token，供 <img>）。加 &t=时间戳 防缓存。 */
  screenshotUrl: (id: string) => withAuthToken(`/api${BASE}/sessions/${id}/screenshot`),
  /** 远程点击：归一化坐标 fx,fy ∈ [0,1]（相对显示图比例）。 */
  click: (id: string, fx: number, fy: number) =>
    jsonReq<void>(`${BASE}/sessions/${id}/click`, { method: 'POST', body: JSON.stringify({ fx, fy }) }),
}

// ── 录制 ─────────────────────────────────────────────────────────────────

export const recordings = {
  start: (sessionId: string, body: StartRecordingBody = {}) =>
    jsonReq<RecordingView>(`${BASE}/sessions/${sessionId}/recordings`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  stop: (id: string) =>
    jsonReq<RecordingView>(`${BASE}/recordings/${id}/stop`, { method: 'POST' }),
  list: (sessionId: string) =>
    jsonReq<RecordingView[]>(`${BASE}/sessions/${sessionId}/recordings`),
  detail: (id: string, opts: { withCalls?: boolean; offset?: number; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (opts.withCalls != null) params.set('withCalls', String(opts.withCalls))
    if (opts.offset != null) params.set('offset', String(opts.offset))
    if (opts.limit != null) params.set('limit', String(opts.limit))
    const qs = params.toString()
    return jsonReq<RecordingDetail>(`${BASE}/recordings/${id}${qs ? '?' + qs : ''}`)
  },
  delete: (id: string) => jsonReq<void>(`${BASE}/recordings/${id}`, { method: 'DELETE' }),
}

// ── 任务 ─────────────────────────────────────────────────────────────────

export const tasks = {
  create: (body: CreateTaskBody) =>
    jsonReq<TaskView>(`${BASE}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: UpdateTaskBody) =>
    jsonReq<TaskView>(`${BASE}/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  list: (sessionId: string) => jsonReq<TaskView[]>(`${BASE}/sessions/${sessionId}/tasks`),
  detail: (id: string) => jsonReq<TaskView>(`${BASE}/tasks/${id}`),
  delete: (id: string) => jsonReq<void>(`${BASE}/tasks/${id}`, { method: 'DELETE' }),
}

// ── 回放 ─────────────────────────────────────────────────────────────────

export const replays = {
  trigger: (taskId: string, body: ReplayBody) =>
    jsonReq<TaskRunView>(`${BASE}/tasks/${taskId}/replay`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  listRuns: (taskId: string, limit = 50) =>
    jsonReq<TaskRunView[]>(`${BASE}/tasks/${taskId}/runs?limit=${limit}`),
  runDetail: (runId: string) => jsonReq<TaskRunView>(`${BASE}/task-runs/${runId}`),
}

// ── AI 用例 ──────────────────────────────────────────────────────────────

export const aiFlows = {
  /** 自然语言 → LLM 生成（或带失败上下文重写）脚本，后端已校验。 */
  generate: (sessionId: string, body: GenerateFlowBody) =>
    jsonReq<GenerateFlowResult>(`${BASE}/sessions/${sessionId}/ai-flows/generate`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  /** 执行一段未落库的脚本，返回逐步结果 + 断言裁决 + 失败现场。 */
  run: (sessionId: string, steps: FlowAction[]) =>
    jsonReq<FlowRunResult>(`${BASE}/sessions/${sessionId}/ai-flows/run`, {
      method: 'POST', body: JSON.stringify({ steps }),
    }),
  /** 人工确认后保存为用例。 */
  save: (sessionId: string, body: { name: string; instruction: string; steps: FlowAction[] }) =>
    jsonReq<AiFlowView>(`${BASE}/sessions/${sessionId}/ai-flows`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  list: (sessionId: string) => jsonReq<AiFlowView[]>(`${BASE}/sessions/${sessionId}/ai-flows`),
  runSaved: (flowId: string) =>
    jsonReq<FlowRunResult>(`${BASE}/ai-flows/${flowId}/run`, { method: 'POST' }),
  delete: (flowId: string) => jsonReq<void>(`${BASE}/ai-flows/${flowId}`, { method: 'DELETE' }),
}

// ── SSE 工厂 ─────────────────────────────────────────────────────────────

export interface RecordingStreamHandlers {
  /** 订阅时后端先推一次已落库的 calls，弥补订阅前的空窗 */
  onBackfill?: (views: HttpCallStreamView[]) => void
  onCall?: (view: HttpCallStreamView) => void
  onStopped?: (payload: { status: string; reason: string; callCount: number; endedAt: number }) => void
  onError?: (err: Event) => void
}

export function openRecordingStream(recordingId: string, h: RecordingStreamHandlers): () => void {
  const es = authEventSource(`${BASE}/recordings/${recordingId}/events`)
  es.addEventListener('backfill', e => {
    try { h.onBackfill?.(JSON.parse((e as MessageEvent).data) as HttpCallStreamView[]) }
    catch { /* ignore parse error */ }
  })
  es.addEventListener('call', e => {
    try { h.onCall?.(JSON.parse((e as MessageEvent).data) as HttpCallStreamView) }
    catch { /* ignore parse error */ }
  })
  es.addEventListener('recording-stopped', e => {
    try { h.onStopped?.(JSON.parse((e as MessageEvent).data)) }
    catch { /* ignore */ }
  })
  es.onerror = e => h.onError?.(e)
  return () => es.close()
}

export interface ReplayStreamHandlers {
  onRunStarted?: (payload: { id: string; taskId: string; status: string; startedAt: number; stepCount: number }) => void
  /** run 一开跑就发——可以立即看到归档目录路径，不用等所有迭代完成 */
  onOutputDir?: (payload: { outputDir: string }) => void
  onStep?: (result: import('./types').StepResultView) => void
  onRunDone?: (payload: { status: string; okSteps: number; failedSteps: number; finishedAt: number; outputDir?: string }) => void
  onRunFailed?: (payload: { status: string; abortedAtStep: number; errorMessage: string; finishedAt: number; outputDir?: string }) => void
  onError?: (err: Event) => void
}

export function openReplayStream(runId: string, h: ReplayStreamHandlers): () => void {
  const es = authEventSource(`${BASE}/task-runs/${runId}/events`)
  es.addEventListener('run-started', e => {
    try { h.onRunStarted?.(JSON.parse((e as MessageEvent).data)) } catch { /* */ }
  })
  es.addEventListener('output-dir', e => {
    try { h.onOutputDir?.(JSON.parse((e as MessageEvent).data)) } catch { /* */ }
  })
  es.addEventListener('step', e => {
    try { h.onStep?.(JSON.parse((e as MessageEvent).data)) } catch { /* */ }
  })
  es.addEventListener('run-done', e => {
    try { h.onRunDone?.(JSON.parse((e as MessageEvent).data)) } catch { /* */ }
  })
  es.addEventListener('run-failed', e => {
    try { h.onRunFailed?.(JSON.parse((e as MessageEvent).data)) } catch { /* */ }
  })
  es.onerror = e => h.onError?.(e)
  return () => es.close()
}
