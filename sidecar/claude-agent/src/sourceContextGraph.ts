export const DEFAULT_GRAPH_JSON_FALLBACK_MAX_BYTES = 32 * 1024 * 1024

type ActiveQuery = {
  key: string
  promise: Promise<string>
}

type CachedQuery = {
  value: string
  expiresAt: number
}

/**
 * Graphify loads a large graph for every CLI invocation. Keep one expensive query in flight,
 * coalesce identical requests, and let unrelated concurrent requests degrade immediately instead
 * of queueing behind the first query until the outer MCP watchdog fires.
 */
export class GraphifyQueryCoordinator {
  private active: ActiveQuery | null = null
  private readonly cache = new Map<string, CachedQuery>()

  constructor(
    private readonly cacheTtlMs = 5 * 60_000,
    private readonly maxCacheEntries = 16,
  ) {}

  resolve(
    key: string,
    execute: () => Promise<string>,
    busyFallback: () => string,
  ): Promise<string> {
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
    if (cached) this.cache.delete(key)

    if (this.active) {
      if (this.active.key === key) return this.active.promise
      return Promise.resolve(busyFallback())
    }

    const promise = execute()
      .then(value => {
        this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs })
        while (this.cache.size > this.maxCacheEntries) {
          const oldest = this.cache.keys().next().value as string | undefined
          if (!oldest) break
          this.cache.delete(oldest)
        }
        return value
      })
      .finally(() => {
        if (this.active?.promise === promise) this.active = null
      })
    this.active = { key, promise }
    return promise
  }
}

export function isGraphJsonSafeForFallback(
  sizeBytes: number,
  maxBytes = DEFAULT_GRAPH_JSON_FALLBACK_MAX_BYTES,
): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes >= 0 && sizeBytes <= maxBytes
}
