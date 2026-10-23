import type { Readable, Writable } from 'node:stream'

/** The owning JVM alone holds the input pipe. EOF also arrives when that JVM crashes. */
export function watchParentLifetime(input: Readable, stop: (reason: string) => void, outputs: readonly Writable[] = []): void {
  let stopped = false
  const finish = (reason: string) => {
    if (stopped) return
    stopped = true
    stop(reason)
  }
  input.once('end', () => finish('parent-stdin-closed'))
  input.once('close', () => finish('parent-stdin-closed'))
  input.once('error', () => finish('parent-stdin-error'))
  // Logging after the JVM closes its read end must not recurse through uncaughtException/EPIPE.
  for (const output of outputs) output.on('error', () => finish('parent-output-closed'))
  input.resume()
  if (input.readableEnded || input.destroyed) finish('parent-stdin-closed')
}

/** Async exporter cleanup must not keep an orphan listening indefinitely. */
export function stopWithinDeadline(cleanup: () => Promise<unknown>, exit: (code: number) => void, timeoutMs = 3000): void {
  let finished = false
  const finish = (code: number) => {
    if (finished) return
    finished = true
    clearTimeout(deadline)
    exit(code)
  }
  const deadline = setTimeout(() => finish(1), timeoutMs)
  deadline.unref()
  void Promise.resolve().then(cleanup).then(() => finish(0), error => {
    console.error('[sidecar] shutdown cleanup failed:', error)
    finish(1)
  })
}
