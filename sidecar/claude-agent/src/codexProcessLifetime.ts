import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Interface } from 'node:readline'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

/** Observe from spawn, including ENOENT and close events that precede an await. */
export class CodexProcessLifetime {
  private closed = false
  private readonly waiters = new Set<() => void>()

  constructor(readonly child: ChildProcessWithoutNullStreams) {
    child.once('close', () => {
      this.closed = true
      for (const notify of this.waiters) notify()
      this.waiters.clear()
    })
  }

  wait(timeoutMs: number): Promise<boolean> {
    if (this.closed) return Promise.resolve(true)
    return new Promise(resolveWait => {
      const finish = (closed: boolean) => {
        clearTimeout(timer)
        this.waiters.delete(onClose)
        resolveWait(closed)
      }
      const onClose = () => finish(true)
      const timer = setTimeout(() => finish(false), timeoutMs)
      timer.unref?.()
      this.waiters.add(onClose)
    })
  }

  /** Release protocol listeners, but consume remaining bytes until native EOF. */
  drain(lines: Interface): void {
    lines.removeAllListeners('line')
    lines.close()
    this.child.stdout.resume()
    this.child.stderr.resume()
  }

  onClose(listener: () => void): void {
    if (this.closed) listener()
    else this.waiters.add(listener)
  }
}

const lifetimes = new WeakMap<ChildProcessWithoutNullStreams, CodexProcessLifetime>()
export function observeCodexProcess(child: ChildProcessWithoutNullStreams): CodexProcessLifetime {
  let lifetime = lifetimes.get(child)
  if (!lifetime) {
    lifetime = new CodexProcessLifetime(child)
    lifetimes.set(child, lifetime)
  }
  return lifetime
}

/** Failed main-turn cleanup must remain a barrier on later sends, not only on retries. */
export class CodexCleanupBarriers {
  private readonly entries = new Map<string, CodexProcessLifetime>()

  private keys(sessionId: string, threadId?: string, codexHome?: string): string[] {
    const directory = resolve(codexHome || resolve(homedir(), '.codex'))
    const home = process.platform === 'win32' ? directory.toLowerCase() : directory
    return [JSON.stringify([home, 'session', sessionId]),
      ...(threadId ? [JSON.stringify([home, 'thread', threadId])] : [])]
  }

  retain(lifetime: CodexProcessLifetime, sessionId: string, threadId?: string, codexHome?: string): void {
    const keys = this.keys(sessionId, threadId, codexHome)
    for (const key of keys) this.entries.set(key, lifetime)
    lifetime.onClose(() => {
      for (const key of keys) if (this.entries.get(key) === lifetime) this.entries.delete(key)
    })
  }

  async verify(sessionId: string, threadId: string | undefined, codexHome: string | undefined, timeoutMs: number): Promise<void> {
    for (const key of this.keys(sessionId, threadId, codexHome)) {
      while (this.entries.has(key)) {
        const lifetime = this.entries.get(key)!
        if (!await lifetime.wait(timeoutMs)) {
          throw new Error(`上一轮 Codex 进程尚未确认关闭（PID ${lifetime.child.pid ?? 'unknown'}），已阻止新轮次；稍后发送将重新核验`)
        }
        if (this.entries.get(key) === lifetime) this.entries.delete(key)
      }
    }
  }
}

export const codexCleanupBarriers = new CodexCleanupBarriers()
