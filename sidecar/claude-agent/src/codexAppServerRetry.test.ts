import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexAppServerTurnError } from './codexAppServer.js'
import {
  emitCodexThreadWriterConflict,
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

for (const retrySafe of [true, false]) {
  test(`pauses the queue after a writer conflict with retrySafe=${retrySafe}`, () => {
    const events: Record<string, unknown>[] = []
    const error = new CodexAppServerTurnError('thread native-thread-id already has an active writer', retrySafe)
    assert.equal(emitCodexThreadWriterConflict(error, event => events.push(event)), true)
    assert.equal(events[0].code, 'CODEX_THREAD_WRITER_BUSY')
    assert.match(String(events[0].message), /VS Code/)
    assert.doesNotMatch(String(events[0].message), /上一轮|native-thread-id/)
    assert.deepEqual(events[1], { type: 'result', usage: {}, stopReason: 'error', queueReleaseSafe: false })
  })
}

test('does not mistake other thread-store failures for an active writer', async () => {
  const error = new CodexAppServerTurnError('thread-store conflict: unexpected revision', true)
  const events: Record<string, unknown>[] = []
  let attempts = 0
  assert.equal(isRetryableThreadWriterConflict(error), false)
  assert.equal(emitCodexThreadWriterConflict(error, event => events.push(event)), false)
  await assert.rejects(() => runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    throw error
  }, () => assert.fail('must not retry a different persistence failure')), /unexpected revision/)
  assert.equal(attempts, 1)
  assert.deepEqual(events, [])
})

test('does not replay an accepted turn when its writer conflict is reported', async () => {
  const error = new CodexAppServerTurnError('thread native-thread-id already has an active writer', false)
  let attempts = 0
  await assert.rejects(() => runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    throw error
  }, () => assert.fail('must not replay an accepted turn')), /active writer/)
  assert.equal(attempts, 1)
})

test('waits through repeated writer conflicts and sends the turn once the writer releases', async () => {
  let attempts = 0
  const retries: number[] = []
  await runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    if (attempts < 4) throw new CodexAppServerTurnError('thread-store conflict: active writer', true)
  }, (_error, attempt) => { retries.push(attempt) }, { maxWriterRetries: 3 })
  assert.equal(attempts, 4)
  assert.deepEqual(retries, [1, 2, 3])
})

test('stops at the writer retry limit without replaying an accepted turn', async () => {
  let attempts = 0
  await assert.rejects(() => runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    throw new CodexAppServerTurnError('thread-store conflict: active writer', true)
  }, () => undefined, { maxWriterRetries: 2 }), /active writer/)
  assert.equal(attempts, 3)
})

test('aborted writer wait does not start another operation', async () => {
  const controller = new AbortController()
  let attempts = 0
  await assert.rejects(() => runCodexAppServerWithStartupRetry(async () => {
    attempts += 1
    throw new CodexAppServerTurnError('thread-store conflict: active writer', true)
  }, () => { controller.abort() }, { maxWriterRetries: 3, signal: controller.signal }), /aborted/i)
  assert.equal(attempts, 1)
})
