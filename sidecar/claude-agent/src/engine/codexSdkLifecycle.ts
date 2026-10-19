import { AsyncLocalStorage } from 'node:async_hooks'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { channel } from 'node:diagnostics_channel'
import type { ThreadEvent } from '@openai/codex-sdk'
import { codexCleanupBarriers, observeCodexProcess } from '../codexProcessLifetime.js'

const PIPE_DRAIN_GRACE_MS = 250
const PROCESS_EXIT_TIMEOUT_MS = 10_000

interface SdkTurn {
  sessionId: string
  threadId?: string
  codexHome?: string
  signal: AbortSignal
}

interface OwnedProcess {
  child: ChildProcessWithoutNullStreams
  lifetime: ReturnType<typeof observeCodexProcess>
}

const scope = new AsyncLocalStorage<{ turn: SdkTurn; owned: OwnedProcess[] }>()
const active = new Map<string, OwnedProcess[]>()

/** A native terminal event ends the turn; inherited EOF is not another task. */
export async function* readCodexSdkTurnEvents(events: AsyncGenerator<ThreadEvent>): AsyncGenerator<ThreadEvent> {
  for await (const event of events) {
    yield event
    if (event.type === 'turn.completed' || event.type === 'turn.failed') return
  }
}

// Node's public spawn diagnostics identify only children created by this SDK call.
// No SDK private fields, global spawn replacement or host process enumeration.
channel('child_process').subscribe(message => {
  const owner = scope.getStore()
  if (!owner) return
  const child = (message as { process: ChildProcessWithoutNullStreams }).process
  child.once('spawn', () => {
    if (!child.spawnargs.includes('exec') || !child.spawnargs.includes('--experimental-json')) return
    const lifetime = observeCodexProcess(child, true)
    owner.owned.push({ child, lifetime })
    // The SDK removes every ChildProcess listener in its finally block. Poll
    // recorded exit facts as well, so SDK cleanup cannot detach our observer.
    const poll = setInterval(() => {
      if (child.exitCode == null && child.signalCode == null) return
      clearInterval(poll)
      void lifetime.wait(0)
      // A descendant may retain stdout after the native writer has exited. Allow
      // buffered protocol bytes to drain, then close our read ends, not the child.
      const timer = setTimeout(() => {
        if (child.stdout.destroyed && child.stderr.destroyed) return
        console.info(JSON.stringify({ event: 'codex_sdk_inherited_pipes_released',
          sessionId: owner.turn.sessionId, pid: child.pid, exitCode: child.exitCode }))
        child.stdout.push(null)
        child.stdout.resume()
        child.stderr.destroy()
      }, PIPE_DRAIN_GRACE_MS)
      timer.unref?.()
      child.once('close', () => clearTimeout(timer))
    }, PIPE_DRAIN_GRACE_MS)
    poll.unref?.()
    console.info(JSON.stringify({ event: 'codex_sdk_process_owned',
      sessionId: owner.turn.sessionId, pid: child.pid }))
  })
})

/** Retry cancellation only for the SDK children owned by this exact session. */
export async function requestCodexSdkCleanup(sessionId: string): Promise<boolean> {
  const owned = active.get(sessionId)
  if (!owned) return false
  let requested = false
  for (const process of owned) {
    if (await process.lifetime.wait(0)) continue
    if (active.get(sessionId) !== owned) return requested
    process.child.kill()
    requested = true
  }
  return requested
}

/** SDK EOF and native writer exit must both settle before releasing a turn. */
export async function withCodexSdkLifecycle<T>(turn: SdkTurn, operation: () => Promise<T>): Promise<T> {
  turn.signal.throwIfAborted()
  await codexCleanupBarriers.verify(turn.sessionId, turn.threadId, turn.codexHome, PROCESS_EXIT_TIMEOUT_MS)
  turn.signal.throwIfAborted()
  const owned: OwnedProcess[] = []
  active.set(turn.sessionId, owned)
  try {
    const result = await scope.run({ turn, owned }, operation)
    if (owned.length === 0 && !turn.signal.aborted) {
      throw new Error('未取得 Codex SDK 本轮进程的退出证据，已暂停队列')
    }
    return result
  } finally {
    let pendingExit = false
    try {
      for (const process of owned) {
        if (!await process.lifetime.wait(PROCESS_EXIT_TIMEOUT_MS)) {
          codexCleanupBarriers.retain(process.lifetime, turn.sessionId, turn.threadId, turn.codexHome)
          pendingExit = true
        }
      }
      if (pendingExit) throw new Error('Codex SDK 原生进程尚未确认退出，已暂停队列并阻止新轮次')
    } finally {
      if (active.get(turn.sessionId) === owned) active.delete(turn.sessionId)
    }
  }
}
