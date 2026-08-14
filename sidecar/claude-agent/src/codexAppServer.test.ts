import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCodexAppServerError, normalizeCodexModel } from './codexAppServer.js'

test('preserves the App Server default-model marker and all supported efforts', () => {
  const model = normalizeCodexModel({
    model: 'gpt-5.6-sol',
    displayName: 'GPT-5.6-Sol',
    isDefault: true,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [
      { reasoningEffort: 'low' },
      { reasoningEffort: 'medium' },
      { reasoningEffort: 'high' },
      { reasoningEffort: 'xhigh' },
      { reasoningEffort: 'max' },
      { reasoningEffort: 'ultra' },
    ],
  })

  assert.equal(model?.isDefault, true)
  assert.deepEqual(model?.reasoningEfforts, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
})

test('keeps structured retryable App Server errors non-terminal', () => {
  const result = classifyCodexAppServerError({
    error: { message: 'stream disconnected: Reconnecting... 2/5' },
    willRetry: true,
    turnId: 'turn-1',
  })
  assert.equal(result.willRetry, true)
  assert.equal(result.attempt, 2)
  assert.equal(result.maxAttempts, 5)
})

test('structured terminal flag wins over legacy reconnect wording', () => {
  const result = classifyCodexAppServerError({
    error: { message: 'Reconnecting... 5/5' },
    willRetry: false,
  })
  assert.equal(result.willRetry, false)
  assert.equal(result.retryExhausted, false)
})

test('supports reconnect notices emitted by older Codex clients', () => {
  const result = classifyCodexAppServerError({ message: 'Reconnecting... 1/5' })
  assert.equal(result.willRetry, true)
  assert.equal(result.retryExhausted, false)
  assert.equal(result.attempt, 1)
})

test('treats the last legacy reconnect notice as exhausted', () => {
  const result = classifyCodexAppServerError({ message: 'Reconnecting... 2/2' })
  assert.equal(result.willRetry, false)
  assert.equal(result.retryExhausted, true)
  assert.equal(result.attempt, 2)
  assert.equal(result.maxAttempts, 2)
})

test('keeps ordinary App Server errors terminal', () => {
  const result = classifyCodexAppServerError({ error: { message: 'authentication failed' } })
  assert.equal(result.willRetry, false)
})
