import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type WebSocket from 'ws'
import { codexDictationAuth, MAX_DICTATION_BYTES, transcribeCodexPcm, validateDictationAudio } from './codexDictation.js'

class Socket extends EventEmitter {
  sent: Record<string, unknown>[] = []
  terminated = false
  send(text: string) { this.sent.push(JSON.parse(text)) }
  terminate() { this.terminated = true }
  event(data: unknown) { this.emit('message', Buffer.from(JSON.stringify(data)), false) }
}
function setup() {
  const socket = new Socket()
  const result = transcribeCodexPcm(Buffer.alloc(64000), { token: 'not-logged', account: 'bound-account' },
    () => socket as unknown as WebSocket)
  socket.emit('open')
  return { socket, result }
}

test('uses only the selected home auth RPC, without reading or starting any thread', async () => {
  const calls: unknown[] = []
  const token = `header.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'account-A' } })).toString('base64url')}.signature`
  assert.deepEqual(await codexDictationAuth('home-A', async (...args) => {
    calls.push(args)
    return { authMethod: 'chatgpt', authToken: token }
  }), { token, account: 'account-A' })
  assert.deepEqual(calls, [['getAuthStatus', { includeToken: true, refreshToken: false }, 'home-A']])
  await assert.rejects(codexDictationAuth('api-home', async () => ({ authMethod: 'apikey', authToken: 'secret' })), /ChatGPT 登录/)
  await assert.rejects(codexDictationAuth('bad', async () => { throw new Error('secret token') }), error => !String(error).includes('secret'))
})

test('validates canonical PCM and rejects empty, odd, malformed and excessive data', () => {
  for (const input of ['', 'AA==', '%%%%', 'AAAA\n', Buffer.alloc(MAX_DICTATION_BYTES + 2).toString('base64')]) {
    assert.throws(() => validateDictationAudio(input))
  }
  assert.equal(validateDictationAudio(Buffer.alloc(MAX_DICTATION_BYTES).toString('base64')).length, MAX_DICTATION_BYTES)
})

test('sends start, bounded PCM frames and close; returns corrected final utterances in speech order', async () => {
  const { socket, result } = setup()
  assert.equal(socket.sent[0].type, 'session.start')
  socket.event({ type: 'session.started' })
  assert.deepEqual(socket.sent.slice(1).map(item => item.type), ['audio.append', 'audio.append', 'session.close'])
  socket.event({ type: 'speech.started', utterance_id: 'first' })
  socket.event({ type: 'speech.started', utterance_id: 'second' })
  socket.event({ type: 'transcript.final', utterance_id: 'second', revision: 1, text: '第二句' })
  socket.event({ type: 'transcript.final', utterance_id: 'first', revision: 2, text: '第一句' })
  socket.event({ type: 'transcript.final', utterance_id: 'first', revision: 1, text: '过期文本' })
  socket.event({ type: 'session.updated', session: { status: 'closed' } })
  assert.equal(await result, '第一句 第二句')
  assert.equal(socket.terminated, true)
})

test('does not return partial text on upstream failure or premature close', async () => {
  for (const event of ['transcript.failed', 'session.error', 'close', 'invalid']) {
    const { socket, result } = setup()
    socket.event({ type: 'session.started' })
    socket.event({ type: 'transcript.final', utterance_id: 'one', revision: 1, text: '不能当作完整结果' })
    if (event === 'close') socket.emit('close')
    else if (event === 'invalid') socket.emit('message', Buffer.from('{'), false)
    else socket.event({ type: event, error: { message: 'secret upstream details' } })
    await assert.rejects(result, error => !String(error).includes('secret'))
    assert.equal(socket.terminated, true)
  }
})

test('reports permission denial and empty speech without leaking authentication', async () => {
  const a = setup()
  a.socket.emit('unexpected-response', {}, { statusCode: 403, resume() {} })
  await assert.rejects(a.result, /账号无法访问/)
  const b = setup()
  b.socket.event({ type: 'session.started' })
  b.socket.event({ type: 'session.updated', session: { status: 'closed' } })
  await assert.rejects(b.result, /没有识别到语音/)
})
