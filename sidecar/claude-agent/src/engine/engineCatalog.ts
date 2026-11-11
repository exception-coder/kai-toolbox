import { builtinEngineRegistry } from './builtinEngineAdapters.js'
import {
  createReadyDeepSeekHarnessAdapter,
  deepSeekHarnessConfigFromEnv,
  type DeepSeekHarnessAdapterConfig,
  type DeepSeekHarnessAdapterDependencies,
} from './deepSeekHarnessAdapter.js'
import type { EngineCapability, EngineDescriptor, EngineId, EngineProbeResult } from './engineContract.js'
import { probeAntigravityRuntime } from '../antigravityRuntime.js'
import { probeTraeRuntime } from '../traeEngine.js'

const DEFAULT_CACHE_TTL_MS = 30_000

/** 依赖外部运行时、必须通过 Sidecar 探活才能创建或切换会话的引擎；其余内置引擎无需同步探活。 */
export const RUNTIME_PROBED_ENGINES: ReadonlySet<EngineId> = new Set<EngineId>(['deepseekHarness', 'antigravity', 'trae'])

/** 探活未就绪时提示给用户的运行时名称。 */
export const RUNTIME_PROBED_ENGINE_LABELS: Readonly<Record<string, string>> = {
  antigravity: 'Antigravity CLI',
  trae: 'TraeCode CLI 2.0',
  deepseekHarness: 'DeepSeek Harness',
}
const DEFAULT_BACKGROUND_REFRESH_MS = 5 * 60_000

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
  backgroundRefreshMs?: number
  antigravityProbe?: () => Promise<EngineProbeResult>
  traeProbe?: () => Promise<EngineProbeResult>
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

  /**
   * 探活涉及外部 CLI 握手（单项最长约 15s），非强制读取一律返回已有快照；过期时在后台重探，
   * 只有首次无快照或用户强制刷新才等待探活完成。
   */
  async list(forceRefresh = false): Promise<readonly EngineCatalogEntry[]> {
    if (!forceRefresh && this.cached) {
      if (this.cached.expiresAt <= Date.now()) void this.revalidate().catch(() => undefined)
      return this.cached.entries
    }
    return this.revalidate()
  }

  /** 定时重探，让新建会话面板读到的始终是现成快照；首轮预热由调用方完成。 */
  startBackgroundRefresh(onError: (error: unknown) => void = () => undefined): () => void {
    const timer = setInterval(() => { void this.revalidate().catch(onError) }, this.options.backgroundRefreshMs ?? DEFAULT_BACKGROUND_REFRESH_MS)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  private revalidate(): Promise<readonly EngineCatalogEntry[]> {
    this.refreshTask ??= this.refresh().finally(() => { this.refreshTask = undefined })
    return this.refreshTask
  }

  async selectable(engine: EngineId): Promise<boolean> {
    return (await this.list()).some(entry => entry.id === engine && entry.selectable)
  }

  selectableNow(engine: EngineId): boolean {
    if (!RUNTIME_PROBED_ENGINES.has(engine)) return true
    return this.cached?.entries.some(entry => entry.id === engine && entry.selectable) === true
  }

  private async refresh(): Promise<readonly EngineCatalogEntry[]> {
    // 三项探活互不依赖，并行执行把强制刷新耗时从累加压到最慢一项。
    const deepSeekTask = createReadyDeepSeekHarnessAdapter(this.deepSeekConfig, this.options.deepSeekDependencies)
    let antigravityProbe: EngineProbeResult
    let traeProbe: EngineProbeResult
    try {
      [antigravityProbe, traeProbe] = await Promise.all([
        (this.options.antigravityProbe ?? probeAntigravityRuntime)(),
        (this.options.traeProbe ?? probeTraeRuntime)(),
      ])
    } catch (error) {
      await (await deepSeekTask.catch(() => undefined))?.adapter?.dispose()
      throw error
    }
    const deepSeek = await deepSeekTask
    const stable = builtinEngineRegistry.descriptors().map(engine => this.entry(engine,
      engine.id === 'antigravity' ? antigravityProbe
        : engine.id === 'trae' ? traeProbe
          : { status: 'ready', engine: engine.id, detail: 'Built-in adapter is available' }))
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
