import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexRealtimeCall, prepareCodexVoice, takeCodexVoice, controlCodexVoice, reconnectCodexVoice } from './codexRealtime.js'

function fixture() {
  const events: Record<string, unknown>[] = []
  const requests: Array<{ method: string; params: Record<string, unknown> }> = []
  let closed = 0
  const call = new CodexRealtimeCall('forge-1', { callId: 'call-1', sdp: 'v=0\r\n' }, e => events.push(e))
  call.take()
  const start = () => call.start('native-1', async (method, params) => {
    requests.push({ method, params }); return {}
  }, () => { closed++ })
  return { call, events, requests, start, closed: () => closed }
}

test('voice negotiates against the same native thread and streams only its own transcript', async () => {
  const f = fixture()
  try {
    await f.start()
    assert.deepEqual(f.requests[0], { method: 'thread/realtime/start', params: {
      threadId: 'native-1', outputModality: 'audio', transport: { type: 'webrtc', sdp: 'v=0\r\n' },
      includeStartupContext: true, version: 'v3',
    } })
    f.call.observe('thread/realtime/transcript/delta', { threadId: 'child', role: 'user', delta: 'wrong' })
    f.call.observe('thread/realtime/transcript/delta', { threadId: 'native-1', role: 'user', delta: 'hello' })
    assert.deepEqual(f.events.filter(e => e.event === 'transcript').map(e => e.text), ['hello'])
    await f.call.appendText([{ type: 'text', text: 'follow up' }])
    assert.deepEqual(f.requests.at(-1), {
      method: 'thread/realtime/appendText',
      params: { threadId: 'native-1', text: 'follow up', role: 'user' },
    })
  } finally { f.call.dispose() }
})

test('multiple native turns keep voice alive; hangup does not interrupt the active code task', async () => {
  const f = fixture()
  try {
    await f.start()
    for (let i = 0; i < 2; i++) {
      f.call.observe('turn/started', { threadId: 'native-1' })
      assert.equal(f.call.completeNativeTurn(), true)
    }
    f.call.observe('turn/started', { threadId: 'native-1' })
    await f.call.stop()
    assert.equal(f.closed(), 0)
    assert.equal(f.call.completeNativeTurn(), false)
    assert.equal(f.requests.at(-1)?.method, 'thread/realtime/stop')
    assert.ok(!f.requests.some(r => r.method === 'turn/interrupt'))
  } finally { f.call.dispose() }
})

test('idle hangup closes once; late realtime events cannot reopen it', async () => {
  const f = fixture()
  try {
    await f.start()
    await f.call.stop()
    await f.call.stop()
    f.call.observe('thread/realtime/started', { threadId: 'native-1' })
    assert.equal(f.closed(), 1)
    assert.equal(f.call.listening, false)
    assert.equal(f.events.filter(e => e.event === 'started').length, 0)
  } finally { f.call.dispose() }
})

test('cancellation before startup never opens the microphone session; stale controls are ignored', async () => {
  prepareCodexVoice('prepare-test', { callId: 'valid', sdp: 'v=0' }, () => {})
  const call = takeCodexVoice('prepare-test', 'valid')!
  try {
    assert.equal(takeCodexVoice('prepare-test'), undefined)
    assert.throws(() => takeCodexVoice('prepare-test', 'valid'), /已取消或过期/)
    await controlCodexVoice('prepare-test', 'old', 'stop')
    assert.equal(call.listening, true)
    await controlCodexVoice('prepare-test', 'valid', 'stop')
    await assert.rejects(call.start('native', async () => { throw new Error('must not call') }, () => {}), /已取消/)
  } finally { call.dispose() }
})

test('cancelled preparation cannot contaminate a text turn or a later voice call', async () => {
  prepareCodexVoice('cancel-test', { callId: 'first', sdp: 'v=0' }, () => {})
  await controlCodexVoice('cancel-test', 'first', 'stop')
  assert.equal(takeCodexVoice('cancel-test'), undefined)
  assert.throws(() => takeCodexVoice('cancel-test', 'first'), /已取消或过期/)
  prepareCodexVoice('cancel-test', { callId: 'second', sdp: 'v=0' }, () => {})
  assert.throws(() => takeCodexVoice('cancel-test', 'first'), /已取消或过期/)
  takeCodexVoice('cancel-test', 'second')!.dispose()
})

test('upstream error is explicit and releases an idle transport', async () => {
  const f = fixture()
  try {
    await f.start()
    f.call.observe('thread/realtime/error', { threadId: 'native-1', message: 'account unavailable' })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.call.failure, 'account unavailable')
    assert.equal(f.events.find(e => e.event === 'error')?.message, 'account unavailable')
    assert.equal(f.closed(), 1)
  } finally { f.call.dispose() }
})

test('reconnect starts new audio on the same thread while the original code task keeps running', async () => {
  const f = fixture()
  const reconnectedEvents: Record<string, unknown>[] = []
  try {
    await f.start()
    f.call.observe('turn/started', { threadId: 'native-1' })
    await f.call.stop()
    f.call.observe('thread/realtime/closed', { threadId: 'native-1' })
    await f.call.reconnect({ callId: 'call-2', sdp: 'v=0\r\nnew' }, e => reconnectedEvents.push(e))
    assert.equal(f.closed(), 0)
    assert.equal(f.call.listening, true)
    assert.deepEqual(f.requests.map(r => r.method), ['thread/realtime/start', 'thread/realtime/stop', 'thread/realtime/start'])
    assert.ok(f.requests.every(r => r.params.threadId === 'native-1'))
    assert.equal(f.requests.at(-1)?.params.transport && (f.requests.at(-1)!.params.transport as { sdp: string }).sdp, 'v=0\r\nnew')
    f.call.observe('thread/realtime/transcript/done', { threadId: 'native-1', role: 'user', text: '继续' })
    assert.equal(reconnectedEvents.at(-1)?.callId, 'call-2')
    assert.equal(f.call.completeNativeTurn(), true)
  } finally { f.call.dispose() }
})

test('waits for old closed notification and keeps the thread alive if code completes during reconnect', async () => {
  const f = fixture()
  try {
    await f.start()
    f.call.observe('turn/started', { threadId: 'native-1' })
    await f.call.stop()
    const reconnect = f.call.reconnect({ callId: 'next', sdp: 'v=0' }, () => {})
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.requests.length, 2)
    assert.equal(f.call.completeNativeTurn(), true)
    f.call.observe('thread/realtime/closed', { threadId: 'native-1' })
    await reconnect
    assert.equal(f.closed(), 0)
    assert.equal(f.call.listening, true)
    await f.call.stop()
    assert.equal(f.closed(), 1)
  } finally { f.call.dispose() }
})

test('the latest device supersedes an earlier pending takeover', async () => {
  const f = fixture()
  try {
    await f.start()
    f.call.observe('turn/started', { threadId: 'native-1' })
    const first = f.call.reconnect({ callId: 'superseded', sdp: 'v=0' }, () => {})
    const rejected = assert.rejects(first, /转移|接管/)
    const reconnect = f.call.reconnect({ callId: 'latest', sdp: 'v=0' }, () => {})
    await new Promise(resolve => setImmediate(resolve))
    f.call.observe('thread/realtime/closed', { threadId: 'native-1' })
    await reconnect
    await rejected
    assert.equal(f.call.offer.callId, 'latest')
    assert.equal(f.requests.filter(r => r.method === 'thread/realtime/start').length, 2)
  } finally { f.call.dispose() }
})

test('takeover preserves an idle listening thread until the new audio connects', async () => {
  const f = fixture()
  try {
    await f.start()
    const takeover = f.call.reconnect({ callId: 'phone', sdp: 'v=0' }, () => {})
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.closed(), 0)
    f.call.observe('thread/realtime/closed', { threadId: 'native-1' })
    await takeover
    assert.equal(f.call.listening, true)
    assert.equal(f.call.offer.callId, 'phone')
    await f.call.stop()
    assert.equal(f.closed(), 1)
    assert.ok(!f.requests.some(request => request.method === 'turn/interrupt'))
  } finally { f.call.dispose() }
})

test('a cancelled reconnect cannot start late, and stale controls cannot stop its successor', async () => {
  const events: Record<string, unknown>[] = []
  prepareCodexVoice('reconnect-control', { callId: 'old', sdp: 'v=0' }, e => events.push(e))
  const call = takeCodexVoice('reconnect-control', 'old')!
  const methods: string[] = []
  try {
    await call.start('native', async method => { methods.push(method); return {} }, () => {})
    call.observe('turn/started', { threadId: 'native' })
    await call.stop()
    const cancelled = reconnectCodexVoice('reconnect-control', { callId: 'cancelled', sdp: 'v=0' }, e => events.push(e))
    await controlCodexVoice('reconnect-control', 'cancelled', 'stop')
    call.observe('thread/realtime/closed', { threadId: 'native' })
    await cancelled
    assert.equal(methods.filter(m => m === 'thread/realtime/start').length, 1)
    assert.ok(events.some(e => e.callId === 'cancelled' && e.event === 'error'))
    await reconnectCodexVoice('reconnect-control', { callId: 'new', sdp: 'v=0' }, e => events.push(e))
    await controlCodexVoice('reconnect-control', 'old', 'stop')
    assert.equal(call.listening, true)
    assert.ok(!methods.includes('turn/interrupt'))
  } finally { call.dispose() }
})

test('missing voice thread returns a voice-only error without creating a replacement code task', async () => {
  const events: Record<string, unknown>[] = []
  await reconnectCodexVoice('missing', { callId: 'resume', sdp: 'v=0' }, e => events.push(e))
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'voiceEvent')
  assert.equal(events[0].event, 'error')
  assert.equal(takeCodexVoice('missing'), undefined)
})

test('a newer device wins even after the previous device has begun SDP negotiation', async () => {
  const call = new CodexRealtimeCall('in-flight-takeover', { callId: 'desktop', sdp: 'v=0' }, () => {})
  call.take()
  let finishPhone!: () => void
  let starts = 0
  const methods: string[] = []
  try {
    await call.start('native', async method => {
      methods.push(method)
      if (method === 'thread/realtime/start' && ++starts === 2) {
        await new Promise<void>(resolve => { finishPhone = resolve })
      }
      return {}
    }, () => {})
    call.observe('turn/started', { threadId: 'native' })
    const phone = call.reconnect({ callId: 'phone', sdp: 'v=0' }, () => {})
    const rejected = assert.rejects(phone, /接管/)
    await new Promise(resolve => setImmediate(resolve))
    call.observe('thread/realtime/closed', { threadId: 'native' })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(call.offer.callId, 'phone')
    const tablet = call.reconnect({ callId: 'tablet', sdp: 'v=0' }, () => {})
    finishPhone()
    await new Promise(resolve => setImmediate(resolve))
    call.observe('thread/realtime/closed', { threadId: 'native' })
    await tablet
    await rejected
    assert.equal(call.offer.callId, 'tablet')
    assert.equal(call.listening, true)
    assert.deepEqual(methods, ['thread/realtime/start', 'thread/realtime/stop', 'thread/realtime/start',
      'thread/realtime/stop', 'thread/realtime/start'])
  } finally { call.dispose() }
})

test('an unconfirmed old close times out without starting new audio or interrupting code', async () => {
  const f = fixture()
  try {
    await f.start()
    f.call.observe('turn/started', { threadId: 'native-1' })
    await f.call.stop()
    await assert.rejects(f.call.reconnect({ callId: 'timeout', sdp: 'v=0' }, () => {}), /关闭超时/)
    assert.equal(f.closed(), 0)
    assert.deepEqual(f.requests.map(r => r.method), ['thread/realtime/start', 'thread/realtime/stop'])
    assert.equal(f.call.completeNativeTurn(), false)
  } finally { f.call.dispose() }
})

test('failed new negotiation leaves the running code task intact and permits retry', async () => {
  const call = new CodexRealtimeCall('negotiation-failure', { callId: 'old', sdp: 'v=0' }, () => {})
  call.take()
  const methods: string[] = []
  let failStart = false
  let closed = 0
  try {
    await call.start('native', async method => {
      methods.push(method)
      if (method === 'thread/realtime/start' && failStart) throw new Error('negotiation failed')
      return {}
    }, () => { closed++ })
    call.observe('turn/started', { threadId: 'native' })
    await call.stop()
    call.observe('thread/realtime/closed', { threadId: 'native' })
    failStart = true
    await assert.rejects(call.reconnect({ callId: 'failed', sdp: 'v=0' }, () => {}), /negotiation failed/)
    assert.equal(closed, 0)
    assert.equal(call.listening, false)
    call.observe('thread/realtime/closed', { threadId: 'native' })
    failStart = false
    await call.reconnect({ callId: 'retry', sdp: 'v=0' }, () => {})
    assert.equal(call.listening, true)
    assert.ok(!methods.includes('turn/interrupt'))
  } finally { call.dispose() }
})
