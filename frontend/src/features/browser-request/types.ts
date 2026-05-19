export interface SessionView {
  id: string
  name: string
  url: string
  active: boolean
  hasStorage: boolean
  lastActiveAt: number | null
  createdAt: number
  updatedAt: number
  /** storage state 文件字节数，null 表示尚未生成 */
  storageBytes: number | null
  /** storage state 文件最后修改时间（epoch ms），null 表示尚未生成 */
  storageSavedAt: number | null
}

export interface ExecutedResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  rawBodyLength: number
  /** 跟随重定向后的最终 URL；若没有发生重定向，等于请求的 URL */
  finalUrl: string
}

export interface ExecuteRequestBody {
  /** 二选一：直接给 curl 文本 */
  curl?: string
  /** 或者结构化字段 */
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  /** 可选：执行成功后把响应体回写到该 saved 的 lastResponseBody（用作下次编排参考） */
  linkedSavedId?: string
}

export interface SavedRequestView {
  id: string
  sessionId: string
  name: string
  curl: string | null
  method: string | null
  url: string | null
  headers: Record<string, string>
  body: string | null
  outputs: OutputSpec[]
  /** 上次执行响应体（≤256KB，截断后），用作编排时配 outputs 的参考 */
  lastResponseBody: string | null
  lastResponseAt: number | null
  /** 每个 output 名 → 最近一次提取出来的 stringified 值；编排运行时所有 saved 的值合并喂给模板 */
  lastExtractedValues: Record<string, string>
  createdAt: number
  updatedAt: number
}

export interface SaveRequestBody {
  name?: string
  curl?: string
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  outputs?: OutputSpec[]
  lastResponseBody?: string
}

export interface CaptureStatusView {
  active: boolean
  capturedCount: number
  directory: string
}

export interface VarView {
  name: string
  value: string
  updatedAt: number
}

// ── Pipeline 编排链 ─────────────────────────────────────────────────────────

export interface OutputSpec {
  name: string
  jsonPath: string
  /** true 时除写 chain vars 还落到 session vars（持久化到 DB） */
  persist: boolean
}

export interface ForeachSource {
  varName: string
  /** 在变量上再做一次 JSONPath（如 '$.[*].comments[*]'），留空则直接用整个变量 */
  jsonPath?: string
}

export interface PipelineStep {
  /** 客户端 uuid，仅用作 UI key + 排序 */
  id: string
  name: string
  type: 'single' | 'foreach'
  request: ExecuteRequestBody
  /** 仅 foreach 时存在 */
  source?: ForeachSource
  outputs?: OutputSpec[]
  continueOnError?: boolean
  /**
   * 节流间隔（ms）。null/0 表示不等待。
   *   - single：兼容字段，保留旧语义"本 step 后到下一 step"——新建议用 afterStepMs
   *   - foreach：item 之间等待
   */
  requestIntervalMs?: number
  /** 本 step 完成后、进入下一 step 之前等待的毫秒数。所有 step 类型都生效。 */
  afterStepMs?: number
}

export interface PipelineSummary {
  id: string
  sessionId: string
  name: string
  stepCount: number
  createdAt: number
  updatedAt: number
}

export interface PipelineDetail {
  id: string
  sessionId: string
  name: string
  steps: PipelineStep[]
  createdAt: number
  updatedAt: number
}

export interface PipelineStepOutputSample {
  type: string
  /** 数组时为 sample（前 N 项）；标量/对象时为 value */
  value?: unknown
  sample?: unknown
  totalSize?: number
  truncated?: boolean
}

export interface PipelineStepOutputsEntry {
  stepIndex: number
  stepName: string
  outputs: Record<string, PipelineStepOutputSample>
}

export interface PipelineStepResponseEntry {
  stepIndex: number
  stepName: string
  type: 'single' | 'foreach'
  /** foreach 才有 */
  itemIndex?: number
  status?: number
  statusText?: string
  finalUrl?: string
  elapsedMs?: number
  sample?: string
}

export interface PipelineRunSummary {
  id: string
  pipelineId: string
  startedAt: number
  finishedAt: number | null
  status: 'running' | 'done' | 'cancelled' | 'failed'
  dryRun: boolean
  summary: {
    totalSteps?: number
    okSteps?: number
    failedSteps?: number
    failureCount?: number
    abortedAtStep?: number
    stepOutputs?: PipelineStepOutputsEntry[]
    stepResponses?: PipelineStepResponseEntry[]
  } | null
}

export interface PipelineRunFailure {
  stepIndex: number
  stepName: string
  itemIndex: number | null
  error: string
  urlSample?: string | null
  itemSample?: string | null
}

export interface PipelineRunDetail extends PipelineRunSummary {
  failures: PipelineRunFailure[] | null
}
