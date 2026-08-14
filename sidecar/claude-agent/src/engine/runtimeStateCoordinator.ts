import type { EngineRuntimeObservation, EngineRuntimeSnapshot } from './engineContract.js'

/** Derives one adapter-layer state without inspecting provider-specific event text. */
export function deriveEngineRuntimeSnapshot(
  observation: EngineRuntimeObservation,
): EngineRuntimeSnapshot {
  const transport = observation.transport ?? 'connected'
  const authoritative = observation.authoritativeAgentState
  if (authoritative && authoritative !== 'unknown') {
    return { transport, agentState: authoritative, stateSource: 'adapter' }
  }
  if (!observation.active) {
    return { transport, agentState: 'idle', stateSource: 'sidecar' }
  }
  if (observation.pendingDecision) {
    return { transport, agentState: 'waiting', stateSource: 'sidecar' }
  }
  if (observation.phase === 'finalizing') {
    return { transport, agentState: 'finalizing', stateSource: 'sidecar' }
  }
  return {
    transport,
    agentState: observation.hasActiveController ? 'running' : 'unknown',
    stateSource: 'sidecar',
  }
}
