import type {
  AgentEngineAdapter,
  BuiltinEngineId,
  EngineCapability,
  EngineDescriptor,
  EngineTurnExecutor,
} from './engineContract.js'
import { EngineAdapterRegistry } from './engineRegistry.js'
import { deriveEngineRuntimeSnapshot } from './runtimeStateCoordinator.js'

function descriptor<T extends BuiltinEngineId>(id: T, displayName: string,
                    capabilities: readonly EngineCapability[]): EngineDescriptor & { id: T } {
  return {
    id,
    displayName,
    capabilities: new Set(capabilities),
    availability: 'stable',
  }
}

function delegatedAdapter(engineDescriptor: EngineDescriptor, execute: EngineTurnExecutor,
                          interrupt: () => Promise<void>): AgentEngineAdapter {
  return {
    descriptor: engineDescriptor,
    runTurn: execute,
    interrupt,
    runtimeState: deriveEngineRuntimeSnapshot,
  }
}

export type BuiltinEngineExecutors = Readonly<Record<BuiltinEngineId, EngineTurnExecutor>>

const descriptors = [
  descriptor('claude', 'Claude Code', [
    'resume', 'interrupt', 'subagents', 'attachments', 'modelCatalog',
  ]),
  descriptor('codex', 'Codex', [
    'resume', 'interrupt', 'runtimeState', 'subagents', 'attachments', 'modelCatalog',
  ]),
  descriptor('antigravity', 'Antigravity', [
    'resume', 'interrupt', 'attachments', 'modelCatalog',
  ]),
  descriptor('opencode', 'OpenCode', [
    'resume', 'interrupt', 'modelCatalog',
  ]),
] as const

/** Descriptor-only catalog for discovery; execution uses a session-bound registry. */
export const builtinEngineRegistry = new EngineAdapterRegistry(descriptors.map(engineDescriptor =>
  delegatedAdapter(engineDescriptor, async () => {
    throw new Error(`Engine adapter is not bound to a session: ${engineDescriptor.id}`)
  }, async () => undefined)))

/** Bind provider implementations once per session so orchestration never branches on engine id. */
export function createBuiltinEngineRegistry(executors: BuiltinEngineExecutors,
                                            interrupt: () => Promise<void>): EngineAdapterRegistry {
  return new EngineAdapterRegistry(descriptors.map(engineDescriptor =>
    delegatedAdapter(engineDescriptor, executors[engineDescriptor.id], interrupt)))
}
