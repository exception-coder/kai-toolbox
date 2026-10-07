import type { Writable } from 'node:stream'

/** Route stdin failures to the owning RPC lifecycle, including asynchronous EPIPE. */
export function jsonLineWriter(stream: Writable, onFailure: (error: Error) => void, isClosed: () => boolean) {
  let failed = false
  const fail = (error: Error) => {
    if (failed || isClosed()) return
    failed = true
    onFailure(error)
  }
  // Keep the listener through shutdown: a late error must not become uncaughtException.
  stream.on('error', fail)
  return (message: Record<string, unknown>) => {
    if (isClosed()) return
    if (stream.destroyed || stream.writableEnded || !stream.writable) {
      fail(new Error('Codex App Server stdin 已关闭'))
      return
    }
    try {
      stream.write(JSON.stringify(message) + '\n', error => { if (error) fail(error) })
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  }
}
