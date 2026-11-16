import type { HandoffRunner } from './engineHandoff.js'

export interface ReviewResult { text?: string; model?: string; error?: string }
export interface ReviewRunner extends HandoffRunner { model?: string }

/** One isolated text-only run per attempt. Cancellation also covers cancel-before-start races. */
export class PlanReviewJobs {
  private readonly jobs = new Map<string, { promise: Promise<ReviewResult>; cancel: () => void }>()
  private readonly cancelled = new Map<string, number>()

  cancel(id: string): void {
    this.cancelled.set(id, Date.now())
    this.jobs.get(id)?.cancel()
    this.prune()
  }

  run(id: string, prompt: string, create: (emit: (event: Record<string, unknown>) => void) => ReviewRunner,
      timeoutMs = 180_000): Promise<ReviewResult> {
    this.prune()
    if (this.cancelled.has(id)) return Promise.resolve({ error: 'CANCELLED' })
    const existing = this.jobs.get(id)
    if (existing) return existing.promise
    if (this.jobs.size >= 8) return Promise.resolve({ error: 'BUSY' })
    let cancel = () => {}
    const promise = Promise.resolve().then(async (): Promise<ReviewResult> => {
      let text = '', successful = false, violation = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let runner: ReviewRunner | undefined
      try {
        if (this.cancelled.has(id)) return { error: 'CANCELLED' }
        runner = create(event => {
          if (event.type === 'assistantDelta') text += String(event.text ?? '')
          if (event.type === 'assistantSnapshot') text = String(event.text ?? '')
          if (event.type === 'error' || event.type === 'permissionRequest' || event.type === 'toolUse') violation = true
          if (text.length > 120_000) { violation = true; text = text.slice(0, 120_000); runner?.interrupt() }
          if (event.type === 'result') successful = ['end_turn', 'success', 'completed', 'stop'].includes(String(event.stopReason))
        })
        const stopped = new Promise<never>((_, reject) => {
          cancel = () => { runner?.interrupt(); reject(new Error('CANCELLED')) }
          timer = setTimeout(() => { runner?.interrupt(); reject(new Error('TIMEOUT')) }, timeoutMs)
        })
        const job = this.jobs.get(id)
        if (job) job.cancel = cancel
        if (this.cancelled.has(id)) cancel()
        await Promise.race([runner.runTurn(prompt), stopped])
        if (this.cancelled.has(id)) return { error: 'CANCELLED' }
        if (violation || !successful || !text.trim()) return { error: 'REVIEW_FAILED' }
        return { text, model: runner.model }
      } catch (error) {
        return { error: error instanceof Error && ['TIMEOUT', 'CANCELLED'].includes(error.message) ? error.message : 'REVIEW_FAILED' }
      } finally {
        clearTimeout(timer)
        if (runner) await runner.dispose().catch(() => {})
        this.jobs.delete(id)
        // Retain an attempt tombstone; a duplicate delivery must never repeat the model invocation.
        this.cancelled.set(id, Date.now())
      }
    })
    this.jobs.set(id, { promise, cancel: () => cancel() })
    return promise
  }

  private prune(): void {
    const oldest = Date.now() - 600_000
    for (const [id, at] of this.cancelled) if (at < oldest) this.cancelled.delete(id)
    while (this.cancelled.size > 1000) this.cancelled.delete(this.cancelled.keys().next().value!)
  }
}
