type CacheEntry<T> = {
  value: T
  expiresAt: number
}

type QueueEntry<T> = {
  key: string
  execute: () => Promise<T>
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export interface ScheduledGraphifyQuery<T> {
  key: string
  promise: Promise<T>
  cached: boolean
  phase: 'cached' | 'active' | 'queued'
}

export class GraphifySchedulerBusyError extends Error {
  constructor(readonly maxQueued: number) {
    super(`Graphify 查询队列已满（上限 ${maxQueued}）`)
    this.name = 'GraphifySchedulerBusyError'
  }
}

/**
 * Process-wide scheduler for the CPU-heavy Graphify backend.
 *
 * The official server owns a shared stdio connection and project graph cache. Sending unrelated
 * queries concurrently only creates timeout contention, so work is FIFO with a concurrency of one.
 * Identical requests share one promise and successful results receive a small bounded cache.
 */
export class GraphifyQueryScheduler<T> {
  private active: QueueEntry<T> | null = null
  private closed = false
  private readonly queued: QueueEntry<T>[] = []
  private readonly inFlight = new Map<string, QueueEntry<T>>()
  private readonly cache = new Map<string, CacheEntry<T>>()

  constructor(
    private readonly cacheTtlMs = 5 * 60_000,
    private readonly maxCacheEntries = 24,
    private readonly maxQueued = 32,
  ) {}

  schedule(key: string, execute: () => Promise<T>): ScheduledGraphifyQuery<T> {
    if (this.closed) throw new Error('Graphify 查询调度器已关闭')
    const cached = this.readCache(key)
    if (cached !== undefined) {
      return { key, promise: Promise.resolve(cached), cached: true, phase: 'cached' }
    }

    const existing = this.inFlight.get(key)
    if (existing) {
      return {
        key,
        promise: existing.promise,
        cached: false,
        phase: this.active === existing ? 'active' : 'queued',
      }
    }
    if (this.queued.length >= this.maxQueued) throw new GraphifySchedulerBusyError(this.maxQueued)

    let resolveEntry!: (value: T) => void
    let rejectEntry!: (reason: unknown) => void
    const promise = new Promise<T>((resolve, reject) => {
      resolveEntry = resolve
      rejectEntry = reject
    })
    const entry: QueueEntry<T> = {
      key,
      execute,
      promise,
      resolve: resolveEntry,
      reject: rejectEntry,
    }
    this.inFlight.set(key, entry)
    this.queued.push(entry)
    this.pump()
    return {
      key,
      promise,
      cached: false,
      phase: this.active === entry ? 'active' : 'queued',
    }
  }

  snapshot(): { activeKey?: string; queued: number; inFlight: number; cached: number } {
    this.pruneExpiredCache()
    return {
      activeKey: this.active?.key,
      queued: this.queued.length,
      inFlight: this.inFlight.size,
      cached: this.cache.size,
    }
  }

  clearCache(): void {
    this.cache.clear()
  }

  close(reason = 'Graphify 查询调度器已关闭'): void {
    if (this.closed) return
    this.closed = true
    this.cache.clear()
    const error = new Error(reason)
    for (const entry of this.queued.splice(0)) {
      this.inFlight.delete(entry.key)
      entry.reject(error)
    }
  }

  private pump(): void {
    if (this.active) return
    const entry = this.queued.shift()
    if (!entry) return
    this.active = entry
    void this.execute(entry)
  }

  private async execute(entry: QueueEntry<T>): Promise<void> {
    try {
      const value = await entry.execute()
      this.cache.set(entry.key, { value, expiresAt: Date.now() + this.cacheTtlMs })
      this.trimCache()
      entry.resolve(value)
    } catch (error) {
      entry.reject(error)
    } finally {
      this.inFlight.delete(entry.key)
      if (this.active === entry) this.active = null
      if (!this.closed) this.pump()
    }
  }

  private readCache(key: string): T | undefined {
    const cached = this.cache.get(key)
    if (!cached) return undefined
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key)
      return undefined
    }
    // Refresh insertion order so trimming behaves like a small LRU cache.
    this.cache.delete(key)
    this.cache.set(key, cached)
    return cached.value
  }

  private pruneExpiredCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key)
    }
  }

  private trimCache(): void {
    this.pruneExpiredCache()
    while (this.cache.size > this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined
      if (!oldestKey) return
      this.cache.delete(oldestKey)
    }
  }
}
