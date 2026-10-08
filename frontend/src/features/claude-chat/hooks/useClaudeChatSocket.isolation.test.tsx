import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClaudeChatSocket } from './useClaudeChatSocket'
import type { ChatItem, ServerMessage } from '../types'

const api = vi.hoisted(() => ({
  loadMessages: vi.fn(), listQueuedMessages: vi.fn().mockResolvedValue([]),
}))
vi.mock('../api', () => ({ ...api, loadPublicReviewMessages: vi.fn(), clearQueuedMessages: vi.fn(),
  deleteQueuedMessage: vi.fn(), saveQueuedMessage: vi.fn() }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 'test-login' }), getToken: () => 'test-login',
  ensureFreshToken: () => Promise.resolve(), emitSessionExpired: vi.fn(), logout: vi.fn(), probeAuth: vi.fn() }))
vi.mock('@/lib/vibeEntryDiagnostics', () => ({ reportVibeEntry: vi.fn() }))
vi.mock('../browserNotify', () => ({ notifyPrompt: vi.fn() }))
vi.mock('../sound', () => ({ playNotifySound: vi.fn() }))
vi.mock('../lib/debugLog', () => ({ pushDebug: vi.fn() }))

class TestSocket {
  static CONNECTING = 0
  static OPEN = 1
  static sockets: TestSocket[] = []
  readyState = TestSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  send = vi.fn()
  constructor(_url: string) { TestSocket.sockets.push(this) }
  open() { this.readyState = TestSocket.OPEN; this.onopen?.() }
  close() { this.readyState = 3; this.onclose?.() }
  receive(message: ServerMessage) { this.onmessage?.({ data: JSON.stringify(message) }) }
}

const ready = (id: string): ServerMessage => ({ type: 'ready', sessionId: id, sdkSessionId: `sdk-${id}`,
  seq: 1, epoch: id, status: 'IDLE', engine: 'codex' })
const page = (id: string) => ({ items: [{ kind: 'assistant', id: `h-${id}`, text: `历史 ${id}` } as ChatItem], nextBefore: null })

beforeEach(() => {
  TestSocket.sockets = []
  vi.stubGlobal('WebSocket', TestSocket)
  api.loadMessages.mockImplementation((id: string) => Promise.resolve(page(id.replace('sdk-', ''))))
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('会话消息隔离', () => {
  it('切换后旧连接的输出和ready不能污染新会话或它的缓存', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const old = TestSocket.sockets[0]
    act(() => { old.open(); old.receive(ready('a')) })
    await waitFor(() => expect(result.current.items).toEqual(page('a').items))

    act(() => result.current.switchTo('b'))
    act(() => old.receive({ type: 'assistantDelta', seq: 10, text: '旧会话输出' }))
    expect(result.current.items).toEqual([])
    act(() => old.receive(ready('a')))
    expect(result.current.sessionId).toBe('b')
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(2))
    const current = TestSocket.sockets[1]
    act(() => { current.open(); current.receive(ready('b')) })
    await waitFor(() => expect(result.current.items).toEqual(page('b').items))
    act(() => { result.current.send('B 的新消息'); current.receive({ type: 'assistantDelta', seq: 2, text: 'B 的回复' }) })
    const ownItems = result.current.items
    expect(ownItems.at(-1)).toMatchObject({ kind: 'assistant', text: 'B 的回复' })
    act(() => old.receive({ type: 'assistantDelta', seq: 11, text: '再次迟到' }))
    expect(result.current.items).toEqual(ownItems)

    act(() => result.current.switchTo('a'))
    expect(result.current.items).toEqual(page('a').items)
    act(() => result.current.switchTo('b'))
    expect(result.current.items).toEqual(page('b').items)
  })

  it('切换后迟到的历史响应不能写入当前会话', async () => {
    let finish!: (value: ReturnType<typeof page>) => void
    api.loadMessages.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    act(() => { TestSocket.sockets[0].open(); TestSocket.sockets[0].receive(ready('a')) })
    act(() => result.current.switchTo('b'))
    await act(async () => finish(page('a')))
    expect(result.current.sessionId).toBe('b')
    expect(result.current.items).toEqual([])
  })

  it('连接尚未建立时快速切换，只向最终目标发送切换指令', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => { result.current.switchTo('a'); result.current.switchTo('b'); result.current.switchTo('c') })
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => socket.open())
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([{ type: 'switchSession', sessionId: 'c' }])
    act(() => socket.receive(ready('c')))
    await waitFor(() => expect(result.current.items).toEqual(page('c').items))
    expect(result.current.sessionId).toBe('c')
  })
})
