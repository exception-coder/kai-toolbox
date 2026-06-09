// 与后端 record 字段对齐：tools/tool-browser-request/.../domain/*.java + api/dto/*.java

export type RecordingStatus = 'RECORDING' | 'STOPPED' | 'ABANDONED' | 'AUTO_STOPPED'
export type TaskRunStatus = 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED'
export type ResourceType = 'XHR' | 'FETCH' | 'DOCUMENT' | 'SCRIPT'

export interface SessionView {
  id: string
  name: string
  url: string
  active: boolean
  hasStorage: boolean
  lastActiveAt: number | null
  createdAt: number
  updatedAt: number
  storageBytes: number | null
  storageSavedAt: number | null
  /** 会话引擎：playwright-java / undetected-node；null = 用全局默认。 */
  engine: string | null
}

export interface RecordingView {
  id: string
  sessionId: string
  name: string
  status: RecordingStatus
  captureScript: boolean
  startedAt: number
  endedAt: number | null
  callCount: number
}

export interface HttpCallView {
  id: string
  recordingId: string
  seq: number
  method: string
  url: string
  resourceType: ResourceType
  requestHeaders?: Record<string, string>
  requestBody?: string | null
  status?: number | null
  responseHeaders?: Record<string, string>
  responseBody?: string | null
  responseTruncated: boolean
  sensitive: boolean
  startedAt: number
  elapsedMs?: number | null
  initiator?: string | null
}

/** SSE 'call' 事件载荷（轻量，不含 body）。 */
export interface HttpCallStreamView {
  id: string
  recordingId: string
  seq: number
  method: string
  url: string
  resourceType: ResourceType
  status?: number | null
  elapsedMs?: number | null
  startedAt: number
  responseTruncated: boolean
  sensitive: boolean
}

export interface RecordingDetail {
  recording: RecordingView
  calls: HttpCallView[]
  callsTotal: number
  callsHasMore: boolean
}

/** 参数化点：把 step 中某 field 的一段子串替换为变量。 */
export interface ParameterizationSpec {
  field: string                 // url / path / query.{key} / header.{key} / body
  token: string                 // 原文中的字符串片段（保存时校验恰好出现一次）
  varName: string
}

export interface ExtractSpec {
  name: string
  jsonPath: string
}

export interface ParamSpec {
  name: string
  kind: 'string' | 'number' | 'boolean'
  defaultValue?: string | null
}

export interface AdhocRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string | null
  /** 响应体快照——编辑 task 时供响应树挑变量；不参与回放执行 */
  responseSample?: string | null
}

export interface StepSpec {
  name: string
  fromCallId?: string | null
  adhoc?: AdhocRequest | null
  parameterizations?: ParameterizationSpec[]
  extracts?: ExtractSpec[]
  continueOnError?: boolean | null
}

export interface TaskOptions {
  /** step 之间的延迟下限（ms） */
  stepIntervalMs?: number | null
  /** step 之间的延迟上限（ms）；> stepIntervalMs 时在区间内均匀随机，否则固定为下限 */
  stepIntervalMaxMs?: number | null
  /** 同一 step 内 fan-out 迭代之间的延迟下限（ms）；未填时回退用 stepIntervalMs */
  iterationIntervalMs?: number | null
  /** 同上的上限 */
  iterationIntervalMaxMs?: number | null
  continueOnError?: boolean | null
}

export interface TaskView {
  id: string
  sessionId: string
  recordingId?: string | null
  name: string
  steps: StepSpec[]
  params: ParamSpec[]
  options?: TaskOptions | null
  createdAt: number
  updatedAt: number
}

export interface StepResultView {
  stepIndex: number
  /** 隐式 fan-out 时的迭代序号（从 0 起）；非迭代 step 为 null */
  iterationIndex?: number | null
  /** 隐式 fan-out 时的迭代总数；非迭代 step 为 null */
  iterationTotal?: number | null
  stepName: string
  status?: number | null
  elapsedMs?: number | null
  finalUrl?: string | null
  responseSample?: string | null
  extracted: Record<string, string>
  error?: string | null
}

export interface TaskRunView {
  id: string
  taskId: string
  status: TaskRunStatus
  startedAt: number
  finishedAt?: number | null
  inputs: Record<string, unknown>
  stepResults: StepResultView[]
  errorMessage?: string | null
}

// ── 请求体（与后端 DTO 对齐）────────────────────────────────────────────

/**
 * 录哪些资源在前端选择，每次开录都显式传。
 * 不传 = 后端套默认值（xhr/fetch 开、document/script 关、响应体截断 2 MB）。
 */
export interface StartRecordingBody {
  name?: string
  captureXhr?: boolean
  captureFetch?: boolean
  captureDocument?: boolean
  captureScript?: boolean
  /** 响应体存到多少字节为止；后端会夹到 responseBodyMaxBytes（默认 32 MB）之内 */
  responseBodyTruncateAtBytes?: number
}

export interface CreateTaskBody {
  sessionId: string
  recordingId?: string | null
  name: string
  steps: StepSpec[]
  params: ParamSpec[]
  stepIntervalMs?: number | null
  stepIntervalMaxMs?: number | null
  iterationIntervalMs?: number | null
  iterationIntervalMaxMs?: number | null
  continueOnError?: boolean | null
}

export type UpdateTaskBody = Omit<CreateTaskBody, 'sessionId' | 'recordingId'>

export interface ReplayBody {
  params: Record<string, unknown>
}
