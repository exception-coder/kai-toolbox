import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyCodexAppServerError,
  codexReconnectDeadlineMs,
  findDefaultCodexModel,
  isCodexAppServerRecoverySignal,
  isCurrentCodexTurnNotification,
  normalizeCodexModel,
} from './codexAppServer.js'

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

test('never guesses the first catalog item when App Server has not marked a default', () => {
  const models = [
    { value: 'first', displayName: 'First', description: '', reasoningEfforts: [], defaultReasoningEffort: 'high', fastSupported: false, isDefault: false },
    { value: 'default', displayName: 'Default', description: '', reasoningEfforts: [], defaultReasoningEffort: 'low', fastSupported: false, isDefault: true },
  ]
  assert.equal(findDefaultCodexModel(models)?.value, 'default')
  assert.equal(findDefaultCodexModel(models.slice(0, 1)), undefined)
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

test('accepts all meaningful turn progress as reconnect recovery signals', () => {
  for (const method of [
    'item/reasoning/summaryTextDelta',
    'item/commandExecution/outputDelta',
    'item/mcpToolCall/progress',
    'thread/tokenUsage/updated',
    'thread/status/changed',
    'turn/plan/updated',
    'hook/completed',
  ]) {
    assert.equal(isCodexAppServerRecoverySignal(method), true, method)
  }
  assert.equal(isCodexAppServerRecoverySignal('error'), false)
  assert.equal(isCodexAppServerRecoverySignal('warning'), false)
})

test('gives native retries minutes to recover and legacy final retries a practical grace period', () => {
  const retrying = classifyCodexAppServerError({
    error: { message: 'stream disconnected: Reconnecting... 2/5' },
    willRetry: true,
  })
  const legacyFinal = classifyCodexAppServerError({ message: 'Reconnecting... 5/5' })

  assert.equal(codexReconnectDeadlineMs(retrying), 5 * 60_000)
  assert.equal(codexReconnectDeadlineMs(legacyFinal), 60_000)
})

test('accepts notifications from the current root thread and turn', () => {
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turnId: 'root-turn' },
    'root-thread',
    'root-turn',
  ), true)
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turn: { id: 'root-turn' } },
    'root-thread',
    'root-turn',
  ), true)
})

test('rejects child-agent and stale root-turn notifications', () => {
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'child-thread', turnId: 'child-turn' },
    'root-thread',
    'root-turn',
  ), false)
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turnId: 'previous-turn' },
    'root-thread',
    'root-turn',
  ), false)
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'child-thread', turn: { id: 'child-turn' } },
    'root-thread',
    'root-turn',
  ), false)
})

test('accepts same-thread events before turn/start responds and global events without ids', () => {
  assert.equal(isCurrentCodexTurnNotification(
    { threadId: 'root-thread', turnId: 'root-turn' },
    'root-thread',
    undefined,
  ), true)
  assert.equal(isCurrentCodexTurnNotification(
    { summary: 'global configuration warning' },
    'root-thread',
    'root-turn',
  ), true)
})
