export const BUILTIN_ENGINE_IDS = ['claude', 'codex', 'gemini', 'opencode'] as const

export type BuiltinEngineId = typeof BUILTIN_ENGINE_IDS[number]
export type EngineId = BuiltinEngineId | 'deepseekHarness'

export function isBuiltinEngineId(value: unknown): value is BuiltinEngineId {
  return typeof value === 'string' && BUILTIN_ENGINE_IDS.some(engine => engine === value)
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

/**
 * Compatibility execution seam for existing engines.
 * Native request/session types stay behind the callback until each adapter is migrated independently.
 */
export interface EngineTurnExecution {
  execute(): Promise<void>
}

export interface AgentEngineAdapter {
  readonly descriptor: EngineDescriptor
  runTurn(execution: EngineTurnExecution): Promise<void>
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
