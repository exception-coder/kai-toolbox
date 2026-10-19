import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Interface } from 'node:readline'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

/** Observe from spawn, including ENOENT and close events that precede an await. */
export class CodexProcessLifetime {
  private closed = false
  private readonly waiters = new Set<() => void>()

  constructor(readonly child: ChildProcessWithoutNullStreams, private readonly directNativeProcess = false) {
    child.once('close', () => this.release())
    child.once('exit', code => {
      if (typeof code === 'number') this.confirmExit(code)
    })
  }

  private release(): void {
    this.closed = true
    for (const notify of this.waiters) notify()
    this.waiters.clear()
  }

  /** The Codex CLI mirrors native exit; inherited pipes are not writer liveness. */
  private confirmExit(code: number): void {
    if (this.closed) return
    console.error(JSON.stringify({ event: 'codex_process_exit_confirmed',
      pid: this.child.pid, exitCode: code, signalCode: this.child.signalCode,
      stdoutClosed: this.child.stdout?.destroyed, stderrClosed: this.child.stderr?.destroyed,
      releaseReason: 'launcher_mirrored_native_exit' }))
    this.release()
  }

  wait(timeoutMs: number): Promise<boolean> {
    if (!this.closed && typeof this.child.exitCode === 'number') this.confirmExit(this.child.exitCode)
    // SDK exec starts the native binary directly. Its confirmed signal exit is
    // sufficient; a signalled launcher still needs the ordinary close barrier.
    if (!this.closed && this.directNativeProcess && this.child.signalCode != null) this.release()
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
export function observeCodexProcess(child: ChildProcessWithoutNullStreams, directNativeProcess = false): CodexProcessLifetime {
  let lifetime = lifetimes.get(child)
  if (!lifetime) {
    lifetime = new CodexProcessLifetime(child, directNativeProcess)
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
