import { builtinEngineRegistry } from './builtinEngineAdapters.js'
import {
  createReadyDeepSeekHarnessAdapter,
  deepSeekHarnessConfigFromEnv,
  type DeepSeekHarnessAdapterConfig,
  type DeepSeekHarnessAdapterDependencies,
} from './deepSeekHarnessAdapter.js'
import type { EngineCapability, EngineDescriptor, EngineId, EngineProbeResult } from './engineContract.js'
import { probeAntigravityRuntime } from '../antigravityRuntime.js'

const DEFAULT_CACHE_TTL_MS = 30_000

export interface EngineCatalogEntry {
  id: EngineId
  displayName: string
  capabilities: readonly EngineCapability[]
  availability: EngineDescriptor['availability']
  selectable: boolean
  probe: EngineProbeResult
}

export interface EngineCatalogOptions {
  deepSeekConfig?: DeepSeekHarnessAdapterConfig
  deepSeekDependencies?: DeepSeekHarnessAdapterDependencies
  cacheTtlMs?: number
  antigravityProbe?: () => Promise<EngineProbeResult>
}

/** Owns runtime readiness discovery; UI and session admission consume this single catalog. */
export class EngineCatalog {
  private readonly deepSeekConfig: DeepSeekHarnessAdapterConfig
  private readonly cacheTtlMs: number
  private cached?: { expiresAt: number; entries: readonly EngineCatalogEntry[] }
  private refreshTask?: Promise<readonly EngineCatalogEntry[]>

  constructor(private readonly options: EngineCatalogOptions = {}) {
    this.deepSeekConfig = options.deepSeekConfig ?? deepSeekHarnessConfigFromEnv()
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  }

  async list(forceRefresh = false): Promise<readonly EngineCatalogEntry[]> {
    const now = Date.now()
    if (!forceRefresh && this.cached && this.cached.expiresAt > now) return this.cached.entries
    this.refreshTask ??= this.refresh()
    try {
      return await this.refreshTask
    } finally {
      this.refreshTask = undefined
    }
  }

  async selectable(engine: EngineId): Promise<boolean> {
    return (await this.list()).some(entry => entry.id === engine && entry.selectable)
  }

  selectableNow(engine: EngineId): boolean {
    if (engine !== 'deepseekHarness' && engine !== 'antigravity') return true
    return this.cached?.entries.some(entry => entry.id === engine && entry.selectable) === true
  }

  private async refresh(): Promise<readonly EngineCatalogEntry[]> {
    const antigravityProbe = await (this.options.antigravityProbe ?? probeAntigravityRuntime)()
    const stable = builtinEngineRegistry.descriptors().map(engine => this.entry(engine,
      engine.id === 'antigravity' ? antigravityProbe : {
        status: 'ready',
        engine: engine.id,
        detail: 'Built-in adapter is available',
      }))
    const deepSeek = await createReadyDeepSeekHarnessAdapter(
      this.deepSeekConfig,
      this.options.deepSeekDependencies,
    )
    const deepSeekDescriptor = deepSeek.adapter?.descriptor ?? {
      id: 'deepseekHarness' as const,
      displayName: 'DeepSeek Harness',
      capabilities: new Set<EngineCapability>(['resume', 'interrupt', 'runtimeState', 'subagents']),
      availability: 'experimental' as const,
    }
    await deepSeek.adapter?.dispose()
    const entries = Object.freeze([...stable, this.entry(deepSeekDescriptor, deepSeek.probe)])
    this.cached = { expiresAt: Date.now() + this.cacheTtlMs, entries }
    return entries
  }

  private entry(descriptor: EngineDescriptor, probe: EngineProbeResult): EngineCatalogEntry {
    return {
      id: descriptor.id,
      displayName: descriptor.displayName,
      capabilities: [...descriptor.capabilities],
      availability: descriptor.availability,
      selectable: probe.status === 'ready',
      probe,
    }
  }
}
