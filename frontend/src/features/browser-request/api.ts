import type {
  CreateTaskBody, HttpCallStreamView, RecordingDetail, RecordingView,
  ReplayBody, SessionView, StartRecordingBody, TaskRunView, TaskView, UpdateTaskBody,
} from './types'

import { http } from '@/lib/api'
import { withAuthToken } from '@/lib/auth'

const BASE = '/api/browser-request'

// 统一收口：所有 JSON 请求一律复用全站共享客户端 http()——它统一做了 token 续期(ensureFreshToken)、
// 带 JWT(Authorization)、mock 拦截、204 处理与 ApiError 包装。本模块不再自建裸 fetch，避免再次漏带
// token 导致 admin-only 软鉴权静默返回空 []。http() 期望不含 /api 前缀的 path，故转发前去掉 BASE 的 /api。
function jsonReq<T>(path: string, init?: RequestInit): Promise<T> {
  return http<T>(path.replace(/^\/api/, ''), init)
}

// ── 会话 ─────────────────────────────────────────────────────────────────

export const sessions = {
  list: () => jsonReq<SessionView[]>(`${BASE}/sessions`),
  create: (body: { name: string; url: string }) =>
    jsonReq<SessionView>(`${BASE}/sessions`, { method: 'POST', body: JSON.stringify(body) }),
  open: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/open`, { method: 'POST' }),
  save: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/save`, { method: 'POST' }),
  clear: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/clear`, { method: 'POST' }),
  close: (id: string) => jsonReq<SessionView>(`${BASE}/sessions/${id}/close`, { method: 'POST' }),
  delete: (id: string) => jsonReq<void>(`${BASE}/sessions/${id}`, { method: 'DELETE' }),
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

// ── SSE 工厂 ─────────────────────────────────────────────────────────────

export interface RecordingStreamHandlers {
  /** 订阅时后端先推一次已落库的 calls，弥补订阅前的空窗 */
  onBackfill?: (views: HttpCallStreamView[]) => void
  onCall?: (view: HttpCallStreamView) => void
  onStopped?: (payload: { status: string; reason: string; callCount: number; endedAt: number }) => void
  onError?: (err: Event) => void
}

export function openRecordingStream(recordingId: string, h: RecordingStreamHandlers): () => void {
  const es = new EventSource(withAuthToken(`${BASE}/recordings/${recordingId}/events`))
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
  const es = new EventSource(withAuthToken(`${BASE}/task-runs/${runId}/events`))
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
