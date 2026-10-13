/** Retains the original process observer so a failed release can be verified again. */
export class CodexPredictionCleanupError extends Error {
  constructor(readonly verifyRelease: () => Promise<void>, cause: unknown) {
    super('Codex 预测进程尚未确认退出，暂不能开始下一轮；再次发送时将重新核验', { cause })
    this.name = 'CodexPredictionCleanupError'
  }
}

/** Retry observation, never launch another writer or repeat forced termination. */
export function createPredictionClose(
  release: () => Promise<unknown>,
  waitForClose: () => Promise<boolean>,
  processState: () => Record<string, unknown>,
): () => Promise<void> {
  let attempted = false
  let released = false
  let pending: Promise<void> | undefined
  const close = (): Promise<void> => {
    if (released) return Promise.resolve()
    if (pending) return pending
    const observing = attempted
    attempted = true
    pending = (async () => {
      try {
        if (observing) {
          if (!await waitForClose()) throw new Error('原预测进程的 close 尚未确认')
        } else {
          await release()
        }
        released = true
        console.info(JSON.stringify({ event: 'codex_prediction_process_released',
          recovered: observing, ...processState() }))
      } catch (cause) {
        console.warn(JSON.stringify({ event: 'codex_prediction_process_release_failed',
          observing, ...processState() }))
        throw new CodexPredictionCleanupError(close, cause)
      }
    })().finally(() => { pending = undefined })
    return pending
  }
  return close
}
