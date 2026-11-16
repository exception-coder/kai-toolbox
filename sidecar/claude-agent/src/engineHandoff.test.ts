import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acknowledgeHandoff, HANDOFF_ENGINES, type HandoffRunner } from './engineHandoff.js'

test('native restore requires matching handle, exact operation acknowledgement and successful terminal', async () => {
  let disposed = false
  const handle = await acknowledgeHandoff('request', 'native', 'history', emit => ({
    sdkSessionId: 'native',
    async runTurn(text) {
      assert.equal(text, 'history')
      emit({ type: 'assistantDelta', text: 'FORGE_HANDOFF_ACK:request' })
      emit({ type: 'result', stopReason: 'end_turn' })
    },
    interrupt() {}, async dispose() { disposed = true },
  }))
  assert.equal(handle, 'native')
  assert.equal(disposed, true)
})

for (const variant of ['wrong-ack', 'changed-native', 'failed', 'tool', 'missing-native']) {
  test(`does not commit ${variant}`, async () => {
    await assert.rejects(acknowledgeHandoff('request', 'native', 'history', emit => ({
      sdkSessionId: variant === 'missing-native' ? undefined : variant === 'changed-native' ? 'new' : 'native',
      async runTurn() {
        emit({ type: 'assistantDelta', text: variant === 'wrong-ack' ? 'ok' : 'FORGE_HANDOFF_ACK:request' })
        if (variant === 'tool') emit({ type: 'toolUse' })
        emit({ type: 'result', stopReason: variant === 'failed' ? 'error' : 'end_turn' })
      },
      interrupt() {}, async dispose() {},
    })))
  })
}

test('timeout interrupts candidate and does not accept a late result', async () => {
  let interrupted = false
  let disposed = false
  const candidate: HandoffRunner = { sdkSessionId: 'native', runTurn: () => new Promise(() => {}),
    interrupt() { interrupted = true }, async dispose() { disposed = true } }
  await assert.rejects(acknowledgeHandoff('request', 'native', 'history', () => candidate, 5), /超时/)
  assert.equal(interrupted, true)
  assert.equal(disposed, true)
})

test('capability scope never silently accepts unsupported engines', () => {
  for (const engine of ['claude', 'codex', 'pi']) assert.equal(HANDOFF_ENGINES.has(engine), true)
  for (const engine of ['hermes', 'zcode', 'unknown']) assert.equal(HANDOFF_ENGINES.has(engine), false)
})
