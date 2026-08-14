import type {
  AgentEngineAdapter,
  EngineCapability,
  EngineDescriptor,
  EngineId,
  EngineProbeResult,
  EngineRuntimeObservation,
  EngineRuntimeSnapshot,
  EngineTurnRequest,
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
    if (adapter.descriptor.capabilities.has('interrupt') && !adapter.interrupt) {
      throw new Error(`Engine adapter declares interrupt but does not implement it: ${engine}`)
    }
    if (adapter.descriptor.capabilities.has('runtimeState') && !adapter.runtimeState) {
      throw new Error(`Engine adapter declares runtimeState but does not implement it: ${engine}`)
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

  runTurn(engine: EngineId, request: EngineTurnRequest): Promise<void> {
    return this.resolve(engine).runTurn(request)
  }

  async probe(engine: EngineId): Promise<EngineProbeResult> {
    const adapter = this.resolve(engine)
    return adapter.probe?.() ?? {
      status: 'ready',
      engine,
      detail: 'Adapter does not require an external runtime handshake',
    }
  }

  runtimeState(engine: EngineId, observation: EngineRuntimeObservation): EngineRuntimeSnapshot {
    const adapter = this.resolve(engine)
    if (!adapter.runtimeState) {
      throw new Error(`Engine adapter does not expose runtime state: ${engine}`)
    }
    return adapter.runtimeState(observation)
  }

  interrupt(engine: EngineId): Promise<void> {
    const adapter = this.resolve(engine)
    if (!adapter.interrupt) {
      throw new Error(`Engine adapter does not support interrupt: ${engine}`)
    }
    return adapter.interrupt()
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.adapters.values()].map(adapter => adapter.dispose?.()))
  }
}
