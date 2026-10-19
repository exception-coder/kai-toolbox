import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexRpcTimeoutError, codexRpcTimeoutMs, observeCodexRpc } from './codexRpcPolicy.js'
import { logCodexSdkTransport, logCodexTransportError } from './codexTransportDiagnostics.js'

test('history restoration gets a bounded budget without extending ordinary RPCs', () => {
  for (const method of ['thread/start', 'thread/resume', 'thread/fork']) {
    assert.ok(codexRpcTimeoutMs(method) > 20_000)
    assert.ok(codexRpcTimeoutMs(method) <= 120_000)
  }
  assert.equal(codexRpcTimeoutMs('turn/interrupt'), 20_000)
  assert.equal(codexRpcTimeoutMs('config/read'), 20_000)
})

test('RPC diagnostics preserve failures and omit history, credentials and raw errors', async t => {
  const logs: string[] = []
  t.mock.method(console, 'info', (value: string) => logs.push(value))
  t.mock.method(console, 'warn', (value: string) => logs.push(value))
  const context = { sessionId: 'session', threadId: 'thread' }
  assert.equal(await observeCodexRpc('thread/resume', async () => 'ok', context), 'ok')
  const failure = new Error('secret-token and private history')
  await assert.rejects(observeCodexRpc('thread/resume', async () => { throw failure }, context), error => error === failure)
  await assert.rejects(observeCodexRpc('thread/resume', async () => { throw new CodexRpcTimeoutError('thread/resume', 120_000) }, context), CodexRpcTimeoutError)
  assert.deepEqual(logs.map(value => JSON.parse(value).outcome), ['completed', 'failed', 'timeout'])
  assert.ok(logs.every(value => JSON.parse(value).elapsedMs >= 0))
  assert.doesNotMatch(logs.join('\n'), /secret-token|private history/)
})

test('upstream diagnostics distinguish an explicit 1009 from an unknown close code', t => {
  const logs: string[] = []
  t.mock.method(console, 'warn', (value: string) => logs.push(value))
  t.mock.method(console, 'info', (value: string) => logs.push(value))
  const context = { sessionId: 'session', execution: 'sdkFallback' as const,
    selection: { config: { api_key: 'secret-token' }, contextBytes: 18_000_000, reason: 'large_context' as const } }
  logCodexSdkTransport(context, true)
  logCodexTransportError(context, 'stream disconnected before completion: websocket closed by server before response.completed secret-token')
  logCodexTransportError(context, 'WebSocket close code: 1009 secret-token')
  logCodexTransportError(context, 'ordinary tool failed secret-token')
  const [sdk, unknown, oversized] = logs.map(value => JSON.parse(value))
  assert.equal(logs.length, 3)
  assert.equal(sdk.transport, 'https')
  assert.equal(sdk.inherited, true)
  assert.equal(unknown.closeCode, null)
  assert.equal(unknown.closeCodeKnown, false)
  assert.equal(unknown.kind, 'stream_disconnected')
  assert.equal(oversized.closeCode, 1009)
  assert.equal(oversized.kind, 'message_too_large')
  assert.doesNotMatch(logs.join('\n'), /secret-token|api_key/)
})
