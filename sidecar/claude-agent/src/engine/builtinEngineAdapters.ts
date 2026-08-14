import type { AgentEngineAdapter, BuiltinEngineId, EngineCapability, EngineDescriptor } from './engineContract.js'
import { EngineAdapterRegistry } from './engineRegistry.js'

function descriptor(id: BuiltinEngineId, displayName: string,
                    capabilities: readonly EngineCapability[]): EngineDescriptor {
  return {
    id,
    displayName,
    capabilities: new Set(capabilities),
    availability: 'stable',
  }
}

function delegatedAdapter(engineDescriptor: EngineDescriptor): AgentEngineAdapter {
  return {
    descriptor: engineDescriptor,
    runTurn: execution => execution.execute(),
  }
}

export const builtinEngineRegistry = new EngineAdapterRegistry([
  delegatedAdapter(descriptor('claude', 'Claude Code', [
    'resume', 'interrupt', 'subagents', 'attachments', 'modelCatalog',
  ])),
  delegatedAdapter(descriptor('codex', 'Codex', [
    'resume', 'interrupt', 'runtimeState', 'subagents', 'attachments', 'modelCatalog',
  ])),
  delegatedAdapter(descriptor('gemini', 'Gemini CLI', [
    'resume', 'interrupt',
  ])),
  delegatedAdapter(descriptor('opencode', 'OpenCode', [
    'resume', 'interrupt', 'modelCatalog',
  ])),
])
