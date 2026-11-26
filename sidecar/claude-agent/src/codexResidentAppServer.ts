import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createCodexAppServerConnection } from './codexAppServerConnection.js'

type Runtime = {
  open: (home: string) => ChildProcessWithoutNullStreams
  stop: (child: ChildProcessWithoutNullStreams) => void
  closeTimeoutMs: number
}
type Identity = { sessionId: string; threadId?: string; codexHome?: string }
const IDLE_MS = 10 * 60_000
const MAX_WORKERS = 8

function homePath(home?: string): string {
  const configured = resolve(home || process.env.CODEX_HOME || join(homedir(), '.codex'))
  let path = configured
  try { path = realpathSync.native(configured) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return process.platform === 'win32' ? path.toLowerCase() : path
}

function fileStamp(path: string): string {
  try {
    const file = statSync(path)
    return `${file.ino}:${file.size}:${file.mtimeMs}:${file.ctimeMs}`
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

function generation(home: string): string {
  return ['auth.json', 'config.toml'].map(name => fileStamp(join(home, name))).join('|')
}

export function codexThreadConfigKey(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_, entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
    return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  })).digest('hex')
}

export class CodexResidentAppServerBusy extends Error {}

class ResidentWorker {
  readonly child: ChildProcessWithoutNullStreams
  readonly connection: ReturnType<typeof createCodexAppServerConnection>
  readonly active = new Set<string>()
  readonly threads = new Map<string, { sessionId: string; configKey?: string }>()
  private idle?: NodeJS.Timeout
  private initializing?: Promise<void>
  private stopping?: Promise<void>
  retired = false

  constructor(readonly stamp: string, home: string, private readonly runtime: Runtime, released: () => void) {
    this.child = runtime.open(home)
    this.connection = createCodexAppServerConnection(this.child, runtime.closeTimeoutMs, 'shared')
    this.connection.lifetime.onClose(() => {
      // Let the connection report the native exit to every active channel first.
      clearTimeout(this.idle)
      this.retired = true
      released()
    })
  }

  initialize(request: (method: string, params: Record<string, unknown>) => Promise<unknown>,
    send: ReturnType<ResidentWorker['connection']['attach']>['send']): Promise<void> {
    this.initializing ??= request('initialize', {
      clientInfo: { name: 'kai_toolbox', title: 'Kai Toolbox', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    }).then(() => {
      send({ method: 'initialized', params: {} })
    })
    return this.initializing
  }

  begin(id: Identity): void {
    if (this.retired || this.active.has(id.sessionId)) throw new CodexResidentAppServerBusy('Codex 会话尚未释放本轮执行权')
    if (id.threadId) this.claim(id.threadId, id.sessionId)
    clearTimeout(this.idle)
    this.active.add(id.sessionId)
  }

  claim(threadId: string, sessionId: string, configKey?: string): void {
    const current = this.threads.get(threadId)
    if (current && current.sessionId !== sessionId) throw new CodexResidentAppServerBusy('该 Codex 原生线程属于另一个 Forge 会话')
    if (configKey || !current) this.threads.set(threadId, { sessionId, configKey })
  }

  end(sessionId: string, retire: boolean): void {
    this.active.delete(sessionId)
    if (retire) this.retired = true
    if (this.active.size) return
    if (this.retired) {
      void this.close().catch(() => undefined)
      return
    }
    this.idle = setTimeout(() => { void this.close().catch(() => undefined) }, IDLE_MS)
    this.idle.unref()
  }

  close(): Promise<void> {
    this.retired = true
    if (this.active.size) return Promise.reject(new CodexResidentAppServerBusy('Codex 正在等待同授权环境的其他轮次完成，请稍后重试'))
    clearTimeout(this.idle)
    this.stopping ??= this.closeNative().catch(error => {
      this.stopping = undefined
      throw error
    })
    return this.stopping
  }

  private async closeNative(): Promise<void> {
    this.connection.dispose()
    this.child.stdin.end()
    if (await this.connection.lifetime.wait(this.runtime.closeTimeoutMs)) return
    this.runtime.stop(this.child)
    if (!await this.connection.lifetime.wait(this.runtime.closeTimeoutMs)) {
      throw new CodexResidentAppServerBusy('尚未确认旧 Codex 进程退出，已保留线程写入保护')
    }
  }
}

export class CodexResidentAppServers {
  private readonly workers = new Map<string, ResidentWorker>()
  private readonly isolated = new Map<string, Set<string>>()

  async acquire(id: Identity, runtime: Runtime): Promise<ResidentWorker> {
    const home = homePath(id.codexHome)
    while (true) {
      const stamp = generation(home)
      if (id.threadId && this.isolated.get(home)?.has(id.threadId)) {
        throw new CodexResidentAppServerBusy('该 Codex 线程正在由独立执行通道使用')
      }
      const existing = this.workers.get(home)
      if (existing && (existing.retired || existing.stamp !== stamp)) {
        await existing.close()
        continue
      }
      if (!existing && this.workers.size >= MAX_WORKERS) {
        const idle = [...this.workers.values()].find(candidate => !candidate.active.size)
        if (!idle) throw new CodexResidentAppServerBusy('常驻 Codex 进程均在处理任务，请稍后重试')
        await idle.close()
        continue
      }
      const worker = existing ?? new ResidentWorker(stamp, home, runtime, () => {
        if (this.workers.get(home) === worker) this.workers.delete(home)
      })
      if (!existing) this.workers.set(home, worker)
      worker.begin(id)
      return worker
    }
  }

  async withIsolatedThread<T>(id: Identity, run: () => Promise<T>): Promise<T> {
    if (!id.threadId) return run()
    const threadId = id.threadId
    const home = homePath(id.codexHome)
    let reservations = this.isolated.get(home)
    if (!reservations) this.isolated.set(home, reservations = new Set())
    if (reservations.has(threadId)) throw new CodexResidentAppServerBusy('该 Codex 线程正在由独立执行通道使用')
    reservations.add(threadId)
    try {
      const worker = this.workers.get(home)
      if (worker?.threads.has(threadId)) await worker.close()
      return await run()
    } finally {
      reservations.delete(threadId)
      if (!reservations.size) this.isolated.delete(home)
    }
  }

  loadedThread(id: Identity): ResidentWorker | undefined {
    const home = homePath(id.codexHome)
    const worker = this.workers.get(home)
    if (!id.threadId || !worker || worker.retired || worker.active.has(id.sessionId)
      || worker.stamp !== generation(home) || this.isolated.get(home)?.has(id.threadId)) return undefined
    const entry = worker.threads.get(id.threadId)
    return entry?.configKey && entry.sessionId === id.sessionId ? worker : undefined
  }
}

export const codexResidentAppServers = new CodexResidentAppServers()
