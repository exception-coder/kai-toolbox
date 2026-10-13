import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { CodexPredictionCoordinator, parseCodexPrediction, readCodexPrediction, type CodexPredictionOptions } from './codexPrediction.js'
import { CodexPredictionCleanupError, createPredictionClose } from './codexPredictionCleanup.js'

const options = (home = 'C:/nonexistent/prediction-test'): CodexPredictionOptions => ({
  sessionId: 'forge-session', threadId: 'native-thread', sourceTurnId: 'turn-one', codexHome: home,
  cwd: process.cwd(), emit: () => {},
})

test('correlates native thread and source turn, with null and failed results remaining optional', () => {
  const event = { threadId: 'native-thread', sourceTurnId: 'turn-one', result: { type: 'completed', text: '继续检查变更' } }
  assert.equal(parseCodexPrediction(event, 'other-thread', 'turn-one'), undefined)
  assert.equal(parseCodexPrediction(event, 'native-thread', 'other-turn'), undefined)
  assert.deepEqual(parseCodexPrediction(event, 'native-thread', 'turn-one'), { text: '继续检查变更' })
  for (const result of [{ type: 'completed', text: null }, { type: 'failed' }, { type: 'completed', text: 'x'.repeat(1_001) }]) {
    assert.deepEqual(parseCodexPrediction({ ...event, result }, 'native-thread', 'turn-one'), { text: null })
  }
})

test('cancellation waits for cleanup and suppresses a late result before another writer can start', async () => {
  let finish!: (value: string | null) => void
  let aborted = false
  const emitted: unknown[] = []
  const coordinator = new CodexPredictionCoordinator(async (_, signal) => {
    signal.addEventListener('abort', () => { aborted = true })
    return new Promise(resolve => { finish = resolve })
  })
  coordinator.start({ ...options(), emit: event => emitted.push(event) })
  let released = false
  const cancellation = coordinator.cancel('native-thread', options().codexHome).then(() => { released = true })
  await Promise.resolve()
  assert.equal(aborted, true)
  assert.equal(released, false)
  finish('旧轮次的建议')
  await cancellation
  assert.equal(released, true)
  assert.deepEqual(emitted, [])
})

test('the same native ID under two authorization directories does not cancel or mix predictions', async () => {
  const finishes = new Map<string, (value: string | null) => void>()
  const emitted: Record<string, unknown>[] = []
  const coordinator = new CodexPredictionCoordinator(async (input, signal) => new Promise(resolve => {
    finishes.set(input.codexHome!, resolve)
    signal.addEventListener('abort', () => resolve(null))
  }))
  coordinator.start({ ...options('C:/auth/a'), emit: event => emitted.push(event) })
  coordinator.start({ ...options('C:/auth/b'), sessionId: 'forge-b', emit: event => emitted.push(event) })
  await coordinator.cancel('native-thread', 'C:/auth/a')
  finishes.get('C:/auth/b')!('检查下一步')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].sessionId, 'forge-b')
})

function fakeProcess(onRequest: (message: Record<string, unknown>, send: (event: unknown) => void) => void) {
  const stdout = new PassThrough()
  const child = new EventEmitter() as ChildProcessWithoutNullStreams
  Object.assign(child, { stdout, stderr: new PassThrough(), stdin: new Writable({
    write(chunk, _, callback) {
      const message = JSON.parse(String(chunk)) as Record<string, unknown>
      onRequest(message, event => stdout.write(JSON.stringify(event) + '\n'))
      callback()
    },
  }) })
  let closed = false
  return { child, close: async () => { closed = true; stdout.end() }, get closed() { return closed } }
}

test('requests the real native prediction contract and waits beyond its empty acknowledgement', async () => {
  const methods: string[] = []
  let publish!: () => void
  const fake = fakeProcess((message, send) => {
    methods.push(String(message.method))
    if (message.id == null) return
    send({ id: message.id, result: {} })
    if (message.method === 'thread/resume') {
      const params = message.params as Record<string, unknown>
      assert.equal(params.sandbox, 'read-only')
      assert.equal(params.approvalPolicy, 'never')
    }
    if (message.method === 'thread/prediction/request') {
      assert.deepEqual(message.params, { threadId: 'native-thread', sourceTurnId: 'turn-one' })
      publish = () => {
        send({ method: 'thread/prediction/updated', params: { threadId: 'other-thread', sourceTurnId: 'turn-one', result: { type: 'completed', text: 'wrong' } } })
        send({ method: 'thread/prediction/updated', params: { threadId: 'native-thread', sourceTurnId: 'turn-one', result: { type: 'completed', text: '核对修改后的行为' } } })
      }
    }
  })
  let resolved = false
  const result = readCodexPrediction(options(), new AbortController().signal, { open: () => fake, timeoutMs: 1_000 })
    .then(text => { resolved = true; return text })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(resolved, false)
  publish()
  assert.equal(await result, '核对修改后的行为')
  assert.equal(fake.closed, true)
  assert.deepEqual(methods, ['initialize', 'initialized', 'thread/resume', 'thread/prediction/request'])
})

test('accepts a notification before acknowledgement and disables session MCP overrides', async () => {
  const fake = fakeProcess((message, send) => {
    if (message.id == null) return
    if (message.method === 'thread/resume') {
      const config = (message.params as Record<string, unknown>).config as Record<string, unknown>
      assert.deepEqual(config.mcp_servers, { nested: { enabled: false }, flat: { enabled: false } })
      assert.equal(config['mcp_servers.flat.enabled'], false)
      assert.equal(config['mcp_servers.nested.enabled'], false)
    }
    if (message.method === 'thread/prediction/request') {
      send({ method: 'thread/prediction/updated', params: { threadId: 'native-thread', sourceTurnId: 'turn-one',
        result: { type: 'completed', text: '先确认验收结果' } } })
      return
    }
    send({ id: message.id, result: {} })
  })
  const result = await readCodexPrediction({ ...options(), config: {
    mcp_servers: { nested: { command: 'not-executed' } }, 'mcp_servers.flat.command': 'not-executed',
  } }, new AbortController().signal, { open: () => fake, timeoutMs: 1_000 })
  assert.equal(result, '先确认验收结果')
  assert.equal(fake.closed, true)
})

test('a prediction timeout releases the process without a user turn or tool call', async () => {
  const methods: string[] = []
  const fake = fakeProcess((message, send) => {
    methods.push(String(message.method))
    if (message.id != null) send({ id: message.id, result: {} })
  })
  const keepAlive = setTimeout(() => {}, 1_000)
  try {
    const text = await readCodexPrediction(options(), new AbortController().signal, { open: () => fake, timeoutMs: 10 })
    assert.equal(text, null)
    assert.equal(fake.closed, true)
    assert.equal(methods.includes('turn/start'), false)
  } finally { clearTimeout(keepAlive) }
})

test('consecutive sends stay blocked until the original prediction closes, then both resume', async () => {
  let nativeClosed = false
  let releaseAttempts = 0
  let observations = 0
  let mainTurns = 0
  const emitted: unknown[] = []
  const fake = fakeProcess((message, send) => {
    if (message.id != null) send({ id: message.id, error: { message: 'prediction unavailable' } })
  })
  const close = createPredictionClose(async () => {
    releaseAttempts++
    throw new Error('native writer still alive')
  }, async () => { observations++; return nativeClosed }, () => ({ pid: 1234, closed: nativeClosed }))
  const coordinator = new CodexPredictionCoordinator((input, signal) => readCodexPrediction(input, signal, {
    open: () => ({ child: fake.child, close }), timeoutMs: 1_000,
  }))
  coordinator.start({ ...options(), emit: event => emitted.push(event) })
  await new Promise(resolve => setImmediate(resolve))
  const sendMessage = async () => {
    await coordinator.cancel('native-thread', options().codexHome)
    mainTurns++
  }
  await assert.rejects(sendMessage(), CodexPredictionCleanupError)
  await assert.rejects(sendMessage(), CodexPredictionCleanupError)
  assert.equal(mainTurns, 0)
  assert.equal(releaseAttempts, 1)
  assert.equal(observations, 2)
  nativeClosed = true
  await sendMessage()
  await sendMessage()
  assert.equal(mainTurns, 2)
  assert.equal(observations, 3)
  assert.deepEqual(emitted, [])
})

test('simultaneous release checks share observation and never repeat forced cleanup', async () => {
  let finish!: (closed: boolean) => void
  let observations = 0
  const close = createPredictionClose(async () => { throw new Error('timeout') }, () => {
    observations++
    return new Promise(resolve => { finish = resolve })
  }, () => ({ pid: 5678 }))
  await assert.rejects(close(), CodexPredictionCleanupError)
  const first = close()
  const second = close()
  assert.equal(first, second)
  assert.equal(observations, 1)
  finish(true)
  await Promise.all([first, second])
  await close()
  assert.equal(observations, 1)
})

test('unexpected runner failures remain visible and cannot unlock another writer', async () => {
  const failure = new Error('unexpected runner failure')
  const coordinator = new CodexPredictionCoordinator(async () => { throw failure })
  coordinator.start(options())
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(coordinator.cancel('native-thread', options().codexHome), error => error === failure)
  await assert.rejects(coordinator.cancel('native-thread', options().codexHome), error => error === failure)
})
