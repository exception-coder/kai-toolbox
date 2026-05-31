export type TaskState = 'QUEUED' | 'PROBING' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED'
export type SegmentState = 'PENDING' | 'DOWNLOADING' | 'DONE' | 'FAILED'
export type RouteType = 'DIRECT' | 'PROXY'
export type HttpEngineType = 'JDK' | 'OKHTTP'

export interface TaskView {
  taskId: number
  url: string
  savePath: string
  filename: string
  totalSize: number
  downloadedSize: number
  state: TaskState
  routeType: RouteType | null
  routeProxy: string | null
  httpEngine: HttpEngineType
  currentRateBps: number
  etaSeconds: number | null
  createdAt: string
  updatedAt: string
}

export interface SegmentView {
  seqNo: number
  offset: number
  length: number
  bytesDownloaded: number
  state: SegmentState
  attempts: number
}

export interface RouteDecisionView {
  routeType: RouteType
  routeProxy: string | null
  directTtfbMs: number | null
  directThroughputBps: number | null
  proxyTtfbMs: number | null
  proxyThroughputBps: number | null
  decidedAt: string
}

export interface TaskDetailView extends Omit<TaskView, 'currentRateBps' | 'etaSeconds'> {
  acceptRanges: boolean
  routeDecision: RouteDecisionView | null
  segments: SegmentView[]
  lastError: string | null
}

export interface ProxyCandidateView {
  source: 'JVM_PROPERTY' | 'ENV' | 'WINDOWS_REGISTRY' | 'TOOLBOX_CONFIG'
  type: string
  host: string
  port: number
  originUrl: string
}

export interface ProxyProbeResult {
  candidates: ProxyCandidateView[]
  effective: ProxyCandidateView | null
  detectedAt: string
}

export interface CreateTaskRequest {
  url: string
  savePath?: string | null
  filename?: string | null
  httpEngine?: HttpEngineType
}

// SSE 推送的事件 payload
export interface ProgressEvent {
  taskId: number
  downloaded: number
  total: number
  rateBps: number
  etaSeconds: number | null
}

export interface StateEvent {
  taskId: number
  state: TaskState
  routeType: RouteType | null
  routeProxy: string | null
  error: string | null
}

export interface SegmentEvent {
  taskId: number
  seqNo: number
  state: SegmentState
  attempts: number
  bytesDownloaded: number
}
