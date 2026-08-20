import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexAppServerTurnError } from './codexAppServer.js'
import {
  isRetryableMcpInitializationFailure,
  isRetryableThreadWriterConflict,
  runCodexAppServerWithStartupRetry,
} from './codexAppServerRetry.js'

test('retries one fresh operation after transient MCP initialization failure', async () => {
  let attempts = 0
  let retries = 0
  await runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    if (attempts === 1) {
      throw new CodexAppServerTurnError('required MCP servers failed to initialize: connection closed: initialize response', true)
    }
  }, () => { retries += 1 })
  assert.equal(attempts, 2)
  assert.equal(retries, 1)
})

test('does not retry after a turn was accepted or for permanent configuration errors', async () => {
  assert.equal(isRetryableMcpInitializationFailure(
    new CodexAppServerTurnError('required MCP servers failed to initialize', false),
  ), false)
  assert.equal(isRetryableMcpInitializationFailure(
    new CodexAppServerTurnError('MCP 初始化失败：入口不存在', true),
  ), false)
})

test('propagates the second initialization failure without a third attempt', async () => {
  let attempts = 0
  await assert.rejects(() => runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    throw new CodexAppServerTurnError('handshaking with MCP server failed: connection closed', true)
  }, () => undefined))
  assert.equal(attempts, 2)
})

test('waits for cleanup before retrying a transient thread writer conflict', async () => {
  const order: string[] = []
  let attempts = 0
  await runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    order.push(`attempt-${attempts}`)
    if (attempts === 1) {
      throw new CodexAppServerTurnError('thread-store conflict: thread t-1 already has an active writer', true)
    }
  }, async error => {
    assert.equal(isRetryableThreadWriterConflict(error), true)
    await Promise.resolve()
    order.push('cleanup-waited')
  })
  assert.deepEqual(order, ['attempt-1', 'cleanup-waited', 'attempt-2'])
})

test('does not classify an accepted turn writer error as retryable', () => {
  assert.equal(isRetryableThreadWriterConflict(
    new CodexAppServerTurnError('thread t-1 already has an active writer', false),
  ), false)
})
