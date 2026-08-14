import type {
  AgentEngineAdapter,
  EngineCapability,
  EngineDescriptor,
  EngineId,
  EngineTurnExecution,
} from './engineContract.js'

/** Engine adapter registry is the only engine-selection seam used by session orchestration. */
export class EngineAdapterRegistry {
  private readonly adapters = new Map<EngineId, AgentEngineAdapter>()

  constructor(adapters: readonly AgentEngineAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter)
  }

  register(adapter: AgentEngineAdapter): void {
    const engine = adapter.descriptor.id
    if (this.adapters.has(engine)) {
      throw new Error(`Engine adapter already registered: ${engine}`)
    }
    this.adapters.set(engine, adapter)
  }

  resolve(engine: EngineId): AgentEngineAdapter {
    const adapter = this.adapters.get(engine)
    if (!adapter) throw new Error(`Engine adapter is not registered: ${engine}`)
    return adapter
  }

  descriptors(): readonly EngineDescriptor[] {
    return [...this.adapters.values()].map(adapter => adapter.descriptor)
  }

  supports(engine: EngineId, capability: EngineCapability): boolean {
    return this.resolve(engine).descriptor.capabilities.has(capability)
  }

  runTurn(engine: EngineId, execution: EngineTurnExecution): Promise<void> {
    return this.resolve(engine).runTurn(execution)
  }
}
