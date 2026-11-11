import assert from 'node:assert/strict'
import test from 'node:test'
import { applyClaudeSessionOptions, parseClaudeSessionOptions } from './claudeSessionOptions.js'

test('Claude effort uses native flag settings and keeps Ultracode independent', async () => {
  for (const effort of ['auto', 'low', 'medium', 'high', 'xhigh', 'max']) {
    const options = parseClaudeSessionOptions({ effort, ultracode: true })
    const received: unknown[] = []
    await applyClaudeSessionOptions({ applyFlagSettings: async settings => { received.push(settings) } }, options)
    assert.deepEqual(received, [{ effortLevel: effort === 'auto' ? null : effort, ultracode: true }])
  }
})

test('native setting errors propagate without claiming parameters were applied', async () => {
  await assert.rejects(applyClaudeSessionOptions({ applyFlagSettings: async () => { throw new Error('native rejected') } },
    { effort: 'max', ultracode: false }), /native rejected/)
})

test('invalid values cannot become an SDK flag or silently fall back to high', () => {
  for (const value of [null, {}, { effort: 'ultracode', ultracode: true }, { effort: 'high', ultracode: 'true' }]) {
    assert.throws(() => parseClaudeSessionOptions(value), /无效/)
  }
})
