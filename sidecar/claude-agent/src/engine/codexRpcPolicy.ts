const REQUEST_TIMEOUT_MS = 20_000
const THREAD_RESTORE_TIMEOUT_MS = 120_000
const RESTORE_METHODS = new Set(['thread/start', 'thread/resume', 'thread/fork'])

export class CodexRpcTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`Codex App Server 请求 ${method} 超时（${timeoutMs}ms）`)
    this.name = 'CodexRpcTimeoutError'
  }
}

/** Native history replay and required MCP startup have a separate bounded budget. */
export function codexRpcTimeoutMs(method: string): number {
  return RESTORE_METHODS.has(method) ? THREAD_RESTORE_TIMEOUT_MS : REQUEST_TIMEOUT_MS
}

export async function observeCodexRpc<T>(
  method: string,
  invoke: () => Promise<T>,
  context: { sessionId: string; threadId?: string },
): Promise<T> {
  const started = Date.now()
  let succeeded = false
  let timedOut = false
  try {
    const result = await invoke()
    succeeded = true
    return result
  } catch (error) {
    timedOut = error instanceof CodexRpcTimeoutError
    throw error
  } finally {
    if (RESTORE_METHODS.has(method) || !succeeded) {
      const entry = JSON.stringify({ event: 'codex_rpc_finished', ...context, method,
        elapsedMs: Date.now() - started, timeoutMs: codexRpcTimeoutMs(method),
        outcome: succeeded ? 'completed' : timedOut ? 'timeout' : 'failed' })
      if (succeeded) console.info(entry)
      else console.warn(entry)
    }
  }
}
