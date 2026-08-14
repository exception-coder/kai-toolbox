export const BUILTIN_ENGINE_IDS = ['claude', 'codex', 'gemini', 'opencode'] as const

export type BuiltinEngineId = typeof BUILTIN_ENGINE_IDS[number]
export type EngineId = BuiltinEngineId | 'deepseekHarness'

export function isBuiltinEngineId(value: unknown): value is BuiltinEngineId {
  return typeof value === 'string' && BUILTIN_ENGINE_IDS.some(engine => engine === value)
}

export function isEngineId(value: unknown): value is EngineId {
  return isBuiltinEngineId(value) || value === 'deepseekHarness'
}

export type EngineCapability =
  | 'resume'
  | 'interrupt'
  | 'runtimeState'
  | 'steering'
  | 'injection'
  | 'subagents'
  | 'attachments'
  | 'modelCatalog'

export type EngineAvailability = 'stable' | 'experimental'
export type EngineTransportState = 'connected' | 'reconnecting' | 'unavailable' | 'unknown'
export type EngineAgentState = 'idle' | 'running' | 'waiting' | 'finalizing' | 'failed' | 'unknown'

export interface EngineDescriptor {
  id: EngineId
  displayName: string
  capabilities: ReadonlySet<EngineCapability>
  availability: EngineAvailability
}

export interface EngineImageInput {
  mediaType: string
  data: string
}

/** Stable turn input owned by Forge; provider-native request types must not cross this boundary. */
export interface EngineTurnRequest {
  sessionId: string
  turnId: string
  text: string
  systemPrompt?: string
  images?: readonly EngineImageInput[]
  developerInstructions?: string
  additionalDirectories: readonly string[]
  signal?: AbortSignal
  emit(event: AgentEvent): void
}

export type EngineTurnExecutor = (request: EngineTurnRequest) => Promise<void>

export type EngineProbeStatus = 'ready' | 'disabled' | 'dependencyMissing' | 'incompatible' | 'unavailable'

export interface EngineProbeResult {
  status: EngineProbeStatus
  engine: EngineId
  channel?: string
  sdkVersion?: string
  runtimeName?: string
  runtimeVersion?: string
  detail?: string
}

export type AgentEventType =
  | 'turn.started'
  | 'assistant.delta'
  | 'reasoning.delta'
  | 'tool.started'
  | 'tool.progress'
  | 'tool.completed'
  | 'subagents.snapshot'
  | 'turn.finalizing'
  | 'turn.completed'
  | 'turn.failed'
  | 'turn.interrupted'
  | 'engine.connection'
  | 'engine.diagnostic'

export interface AgentEvent {
  protocolVersion: 1
  eventId: string
  sessionId: string
  turnId: string
  engine: EngineId
  type: AgentEventType
  observedAt: number
  payload: Readonly<Record<string, unknown>>
  native?: unknown
}

/** Provider-native diagnostics never cross the Sidecar boundary. */
export function publicAgentEvent(event: AgentEvent): Omit<AgentEvent, 'native'> {
  const { native: _native, ...publicEvent } = event
  return publicEvent
}

export interface AgentEngineAdapter {
  readonly descriptor: EngineDescriptor
  runTurn(request: EngineTurnRequest): Promise<void>
  probe?(): Promise<EngineProbeResult>
  interrupt?(): Promise<void>
  runtimeState?(observation: EngineRuntimeObservation): EngineRuntimeSnapshot
  dispose?(): Promise<void>
}

export interface EngineRuntimeObservation {
  active: boolean
  pendingDecision: boolean
  phase?: string
  hasActiveController: boolean
  transport?: EngineTransportState
  authoritativeAgentState?: EngineAgentState
}

export interface EngineRuntimeSnapshot {
  transport: EngineTransportState
  agentState: EngineAgentState
  stateSource: 'adapter' | 'sidecar'
}
