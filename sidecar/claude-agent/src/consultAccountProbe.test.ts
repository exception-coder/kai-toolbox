import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectConsultAccount } from './consultAccountProbe.js'

const catalog = async () => [{ value: 'model', displayName: 'model', description: '', reasoningEfforts: [],
  defaultReasoningEffort: null, fastSupported: false, isDefault: true }]

test('checks selected login and authenticated workspace metadata without a thread or business turn', async () => {
  const calls: string[] = []
  const result = await inspectConsultAccount('B', 'model', async (method, args, home) => {
    calls.push(method); assert.equal(home, 'B')
    if (method === 'account/read') { assert.equal(args.refreshToken, true); return { account: { type: 'chatgpt' } } }
    return { rateLimits: {} }
  }, catalog)
  assert.equal(result.available, true)
  assert.deepEqual(calls, ['account/read', 'account/rateLimits/read'])
})

test('expired or unauthorized accounts fail closed and never leak provider secrets', async () => {
  const result = await inspectConsultAccount('B', 'model', async () => { throw new Error('token=secret') }, catalog)
  assert.equal(result.available, false)
  assert.equal(result.code, 'AUTHORIZATION_FAILED')
  assert.doesNotMatch(JSON.stringify(result), /secret|token=/)
})

test('unsupported model and missing login cannot be saved as valid', async () => {
  assert.equal((await inspectConsultAccount('B', 'other', async () => ({ account: { type: 'chatgpt' } }), catalog)).code, 'MODEL_UNAVAILABLE')
  assert.equal((await inspectConsultAccount('B', 'model', async () => ({ account: null }), catalog)).code, 'LOGIN_REQUIRED')
})
