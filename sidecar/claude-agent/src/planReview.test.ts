import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PlanReviewJobs, type ReviewRunner } from './planReview.js'

test('independent attempts keep results separate and coalesce duplicate deliveries', async () => {
  const jobs = new PlanReviewJobs()
  let calls = 0, disposals = 0
  const create = (emit: (event: Record<string, unknown>) => void): ReviewRunner => ({
    model: 'actual-model', async runTurn(text) {
      calls++; emit({ type: 'assistantSnapshot', text: `意见：${text}` }); emit({ type: 'result', stopReason: 'end_turn' })
    }, interrupt() {}, async dispose() { disposals++ },
  })
  const first = jobs.run('a', '方案 A', create)
  const duplicate = jobs.run('a', '方案 A', create)
  const second = jobs.run('b', '方案 B', create)
  assert.equal(first, duplicate)
  assert.deepEqual(await first, { text: '意见：方案 A', model: 'actual-model' })
  assert.equal((await second).text, '意见：方案 B')
  assert.equal(calls, 2); assert.equal(disposals, 2)
  assert.equal((await jobs.run('a', '方案 A', create)).error, 'CANCELLED')
  assert.equal(calls, 2)
})

for (const violation of ['toolUse', 'permissionRequest', 'error', 'empty', 'oversized', 'bad-result']) {
  test(`does not publish successful review after ${violation}`, async () => {
    const result = await new PlanReviewJobs().run('a', 'material', emit => ({
      async runTurn() {
        emit({ type: 'assistantDelta', text: violation === 'empty' ? '' : violation === 'oversized' ? 'x'.repeat(120001) : '意见' })
        if (!['empty', 'oversized', 'bad-result'].includes(violation)) emit({ type: violation })
        emit({ type: 'result', stopReason: violation === 'bad-result' ? 'error' : 'end_turn' })
      }, interrupt() {}, async dispose() {},
    }))
    assert.equal(result.error, 'REVIEW_FAILED'); assert.equal(result.text, undefined)
  })
}

test('cancel before dispatch never creates a runner, timeout interrupts and disposes', async () => {
  const jobs = new PlanReviewJobs()
  jobs.cancel('pre')
  assert.equal((await jobs.run('pre', 'plan', () => { throw new Error('must not create') })).error, 'CANCELLED')
  let interrupted = false, disposed = false
  const result = await jobs.run('timeout', 'plan', () => ({
    runTurn: () => new Promise(() => {}), interrupt() { interrupted = true }, async dispose() { disposed = true },
  }), 5)
  assert.equal(result.error, 'TIMEOUT'); assert.ok(interrupted && disposed)
})

test('cancellation during execution rejects late text', async () => {
  const jobs = new PlanReviewJobs()
  const result = await jobs.run('active', 'plan', emit => ({
    async runTurn() { jobs.cancel('active'); emit({ type: 'assistantDelta', text: 'late' }); emit({ type: 'result', stopReason: 'end_turn' }) },
    interrupt() {}, async dispose() {},
  }))
  assert.equal(result.error, 'CANCELLED'); assert.equal(result.text, undefined)
})
