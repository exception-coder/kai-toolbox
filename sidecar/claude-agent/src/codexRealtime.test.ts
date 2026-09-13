import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexRealtimeCall, prepareCodexVoice, takeCodexVoice, controlCodexVoice } from './codexRealtime.js'

function fixture() {
  const events: Record<string, unknown>[] = []
  const requests: Array<{ method: string; params: Record<string, unknown> }> = []
  let closed = 0
  const call = new CodexRealtimeCall('forge-1', { callId: 'call-1', sdp: 'v=0\r\n' }, e => events.push(e))
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
