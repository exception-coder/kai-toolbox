export type GraphifyProjectState = 'COLD' | 'WARMING' | 'READY' | 'DEGRADED'

export type GraphifyBackendState = 'STOPPED' | 'STARTING' | 'READY' | 'DEGRADED'

export interface GraphifyRuntimeQuery {
  projectPath: string
  question: string
  tokenBudget: number
  mode?: 'bfs' | 'dfs'
}

export interface GraphifyRuntimeReady {
  status: 'ready'
  state: 'READY'
  text: string
  durationMs: number
  channel: 'persistent-mcp'
  cached: boolean
}

export interface GraphifyRuntimePending {
  status: 'pending'
  state: 'WARMING'
  code: 'GRAPHIFY_WARMING' | 'GRAPHIFY_BUSY'
  phase: 'queued' | 'loading-project-graph' | 'querying'
  retryAfterMs: number
  message: string
  durationMs: number
}

export type GraphifyRuntimeOutcome = GraphifyRuntimeReady | GraphifyRuntimePending

export interface GraphifyBackendSnapshot {
  state: GraphifyBackendState
  pid: number | null
  python?: string
  consecutiveFailures: number
  lastError?: string
}

export interface GraphifyBackend {
  query(input: Required<GraphifyRuntimeQuery>, timeoutMs: number): Promise<string>
  snapshot(): GraphifyBackendSnapshot
  close(reason?: string): Promise<void>
}

export interface GraphifyProjectSnapshot {
  projectPath: string
  state: GraphifyProjectState
  phase: 'idle' | 'queued' | 'loading-project-graph' | 'querying'
  lastStartedAt?: number
  lastReadyAt?: number
  lastFailureAt?: number
  lastError?: string
}

export interface GraphifyRuntimeSnapshot {
  backend: GraphifyBackendSnapshot
  scheduler: {
    activeKey?: string
    queued: number
    inFlight: number
    cached: number
  }
  projects: GraphifyProjectSnapshot[]
}

export type GraphifyBackendErrorKind = 'startup' | 'transport' | 'timeout' | 'query'

export class GraphifyBackendError extends Error {
  constructor(
    readonly kind: GraphifyBackendErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'GraphifyBackendError'
  }
}
