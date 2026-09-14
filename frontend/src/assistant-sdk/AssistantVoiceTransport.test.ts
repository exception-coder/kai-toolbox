import { afterEach, expect, it, vi } from 'vitest'
const media = vi.hoisted(() => ({ offer: vi.fn(), answer: vi.fn(), close: vi.fn(), mute: vi.fn() }))
vi.mock('../features/claude-chat/public-api/voice', async importOriginal => ({
  ...await importOriginal<typeof import('../features/claude-chat/public-api/voice')>(),
  NativeVoiceConnection: class { offer = media.offer; answer = media.answer; close = media.close; mute = media.mute },
}))
import { AssistantWebSocketTransport } from './AssistantWebSocketTransport'
import type { AssistantContextSnapshot, AssistantWidgetState } from './types'

class Socket extends EventTarget {
  readyState: number = WebSocket.CONNECTING
  sent: string[] = []
  send(value: string) { this.sent.push(value) }
  open() { this.readyState = WebSocket.OPEN; this.dispatchEvent(new Event('open')) }
  receive(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })) }
  close() { this.readyState = WebSocket.CLOSED; this.dispatchEvent(new CloseEvent('close')) }
}
const snapshot: AssistantContextSnapshot = {
  protocolVersion: '1.0', application: { appId: 'voice-test' }, page: { url: '/orders', title: '订单' },
  contributions: {}, unavailableProviders: [], capturedAt: 1,
}
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })
it('sends page context but never stores SDP; projects both speakers and ignores stale calls', async () => {
  vi.useFakeTimers()
  media.offer.mockResolvedValue('v=0 PRIVATE_SDP')
  media.answer.mockResolvedValue(undefined)
  const socket = new Socket()
  const states: AssistantWidgetState[] = []
  const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }
  const transport = new AssistantWebSocketTransport({ appId: 'voice-test', wsUrl: '/consult/ws', storage,
    page: snapshot.page, webSocketFactory: () => socket as unknown as WebSocket,
    fetcher: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], nextBefore: null }) }),
  })
  transport.start(state => states.push(state))
  socket.open()
  socket.receive({ type: 'ready', sessionId: 'consult-1', status: 'IDLE' })
  await transport.startVoice(snapshot)
  const offer = socket.sent.map(value => JSON.parse(value)).find(value => value.voice)
  expect(offer.assistant.contextSnapshot.page.title).toBe('订单')
  const event = { type: 'voiceEvent', seq: 0, callId: offer.voice.callId, event: 'transcript' }
  socket.receive({ ...event, role: 'user', text: '查订', done: false })
  socket.receive({ ...event, role: 'user', text: '查订单', done: true })
  socket.receive({ ...event, role: 'assistant', text: '好的', done: true })
  socket.receive({ ...event, callId: 'old', role: 'user', text: '迟到' })
  const messages = states.filter(state => state.messages).at(-1)!.messages!
  expect(messages.map(message => message.content)).toEqual(['查订单', '好的'])
  socket.receive({ ...event, role: 'assistant', text: '口头回复', done: false })
  socket.receive({ type: 'assistantDelta', text: '工具执行说明' })
  expect(states.filter(state => state.messages).at(-1)!.messages!.slice(-2).map(message => message.content))
    .toEqual(['口头回复', '工具执行说明'])
  expect(JSON.stringify(storage.setItem.mock.calls)).not.toContain('PRIVATE_SDP')
  expect(JSON.stringify(states)).not.toContain('PRIVATE_SDP')
  transport.stopVoice()
  expect(socket.sent.map(value => JSON.parse(value)).at(-1)).toMatchObject({ type: 'voiceControl', action: 'stop' })
  transport.destroy()
})
