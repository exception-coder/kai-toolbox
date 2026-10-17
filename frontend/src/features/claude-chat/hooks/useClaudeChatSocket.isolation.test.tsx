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

const ready = (id: string): Extract<ServerMessage, { type: 'ready' }> => ({ type: 'ready', sessionId: id, sdkSessionId: `sdk-${id}`,
  seq: 1, epoch: id, status: 'IDLE', engine: 'codex' })
const page = (id: string) => ({ items: [{ kind: 'assistant', id: `h-${id}`, text: `历史 ${id}` } as ChatItem], nextBefore: null })

beforeEach(() => {
  TestSocket.sockets = []
  vi.stubGlobal('WebSocket', TestSocket)
  api.loadMessages.mockImplementation((id: string) => Promise.resolve(page(id.replace('sdk-', ''))))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('会话消息隔离', () => {
  it('中断等待超时恢复重试入口，但保持运行态且不派发队列', async () => {
    api.listQueuedMessages.mockResolvedValueOnce([{ id: 'q-1', sessionId: 'a', text: 'next', createdAt: 1 }])
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive({ ...ready('a'), status: 'RUNNING', activeTurnId: 'turn-a' }) })
    await waitFor(() => expect(result.current.queued).toHaveLength(1))
    vi.useFakeTimers()
    act(() => result.current.interrupt())
    expect(result.current.interrupting).toBe(true)
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current.interrupting).toBe(false)
    expect(result.current.running).toBe(true)
    expect(result.current.queued).toHaveLength(1)
    expect(result.current.syncWarning).toContain('再次点击终止')
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'send')).toEqual([])
    act(() => result.current.interrupt())
    expect(result.current.interrupting).toBe(true)
    expect(result.current.syncWarning).toBeNull()
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'interrupt')).toHaveLength(2)
    act(() => socket.receive({ type: 'result', usage: {}, stopReason: 'interrupted', seq: 2 }))
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current.interrupting).toBe(false)
    expect(result.current.running).toBe(false)
    expect(result.current.queued).toHaveLength(1)
    expect(result.current.queuePausedReason).toBeTruthy()
    expect(result.current.syncWarning).toBeNull()
  })

  it('引擎清理待确认只解锁重试，不伪造任务完成', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive({ ...ready('a'), status: 'RUNNING', activeTurnId: 'turn-a' }) })
    act(() => result.current.interrupt())
    act(() => socket.receive({ type: 'warning', code: 'INTERRUPT_CLEANUP_PENDING', message: 'pending', seq: 2 }))
    expect(result.current.interrupting).toBe(false)
    expect(result.current.running).toBe(true)
    expect(result.current.syncWarning).toContain('仍保持锁定')
    act(() => socket.receive({ type: 'result', usage: {}, stopReason: 'interrupted', seq: 3 }))
    expect(result.current.syncWarning).toBeNull()
  })

  it('切换会话会取消旧会话的中断等待计时', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive({ ...ready('a'), status: 'RUNNING', activeTurnId: 'turn-a' }) })
    vi.useFakeTimers()
    act(() => result.current.interrupt())
    act(() => { result.current.switchTo('b'); socket.receive(ready('b')) })
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current.sessionId).toBe('b')
    expect(result.current.interrupting).toBe(false)
    expect(result.current.syncWarning).toBeNull()
  })

  it('显式更新最近页绕过旧缓存，重复点击复用同一权威请求', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    act(() => { TestSocket.sockets[0].open(); TestSocket.sockets[0].receive(ready('a')) })
    await waitFor(() => expect(result.current.items).toEqual(page('a').items))
    let finish!: (value: ReturnType<typeof page>) => void
    api.loadMessages.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    let first!: Promise<boolean | null>
    let second!: Promise<boolean | null>
    act(() => { first = result.current.loadHistory(true); second = result.current.loadHistory(true) })
    expect(api.loadMessages).toHaveBeenCalledTimes(2)
    expect(api.loadMessages).toHaveBeenLastCalledWith('sdk-a', '', null, 30, 'a')
    await act(async () => finish(page('latest')))
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(result.current.items).toEqual(page('latest').items)
  })

  it('加载更早期间跳到最新，等待旧页后另取最近页而非使用旧分页结果', async () => {
    api.loadMessages.mockResolvedValueOnce({ ...page('a'), nextBefore: 100 })
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    act(() => { TestSocket.sockets[0].open(); TestSocket.sockets[0].receive(ready('a')) })
    await waitFor(() => expect(result.current.items).toEqual(page('a').items))
    let finish!: (value: ReturnType<typeof page>) => void
    api.loadMessages.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    api.loadMessages.mockResolvedValueOnce(page('latest'))
    let latest!: Promise<boolean | null>
    let repeated!: Promise<boolean | null>
    act(() => { void result.current.loadHistory(false); latest = result.current.loadHistory(true); repeated = result.current.loadHistory(true) })
    expect(api.loadMessages).toHaveBeenLastCalledWith('sdk-a', '', 100, 30, 'a')
    await act(async () => { finish(page('earlier')); await latest })
    expect(api.loadMessages).toHaveBeenLastCalledWith('sdk-a', '', null, 30, 'a')
    expect(api.loadMessages).toHaveBeenCalledTimes(3)
    expect(await repeated).toBe(true)
    expect(result.current.items).toEqual(page('latest').items)
  })

  it('普通复制立即反馈并只发送一次，收到新会话确认后完成且不复制旧消息', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('source'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive(ready('source')) })
    await waitFor(() => expect(result.current.items).toEqual(page('source').items))
    act(() => {
      result.current.duplicateSession('source', 'C:/Users/test/.codex')
      result.current.duplicateSession('source', 'C:/Users/test/.codex')
      result.current.dismissDuplication()
    })
    expect(result.current.duplicationOperation).toMatchObject({ sourceSessionId: 'source', phase: 'pending', authSwitch: false })
    const copies = socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'duplicateSession')
    expect(copies).toEqual([{ type: 'duplicateSession', sourceSessionId: 'source', codexHome: 'C:/Users/test/.codex', reuseAuthSession: false }])
    act(() => socket.receive(ready('copy')))
    expect(result.current.duplicationOperation).toMatchObject({ phase: 'success', targetSessionId: 'copy' })
    expect(result.current.sessionId).toBe('copy')
    expect(result.current.items).toEqual([])
    expect(result.current.duplicatingSessionId).toBeNull()
    act(() => result.current.dismissDuplication())
    expect(result.current.duplicationOperation).toBeNull()
  })

  it('Auth 切换保持复用标识，复用已有会话时不再发送交接包', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.duplicateSession('source', 'C:/Users/test/.codex-other', '交接内容'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive({ ...ready('existing-auth'), authHandoffRequired: false }) })
    expect(result.current.duplicationOperation).toMatchObject({ phase: 'success', authSwitch: true })
    const sent = socket.send.mock.calls.map(([value]) => JSON.parse(value))
    expect(sent).toContainEqual({ type: 'duplicateSession', sourceSessionId: 'source', codexHome: 'C:/Users/test/.codex-other', reuseAuthSession: true })
    expect(sent.some(message => message.type === 'send')).toBe(false)
  })

  it('保留复制失败的真实原因，原会话可继续使用', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('source'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive(ready('source')) })
    act(() => {
      result.current.duplicateSession('source')
      socket.receive({ type: 'error', seq: 2, code: 'ENGINE_UNAVAILABLE', message: '引擎尚未就绪', terminal: false })
    })
    expect(result.current.duplicationOperation).toMatchObject({ phase: 'error', message: '引擎尚未就绪' })
    expect(result.current.duplicatingSessionId).toBeNull()
    expect(result.current.sessionId).toBe('source')
  })

  it('已发送的复制不随重连重复执行，超时显示未知结果并阻止盲目重试', async () => {
    const { result } = renderHook(() => useClaudeChatSocket())
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    vi.useFakeTimers()
    act(() => result.current.duplicateSession('source'))
    const first = TestSocket.sockets[0]
    act(() => first.open())
    act(() => first.close())
    await act(async () => { await vi.advanceTimersByTimeAsync(3_500) })
    expect(TestSocket.sockets).toHaveLength(2)
    act(() => TestSocket.sockets[1].open())
    const copies = TestSocket.sockets.flatMap(socket => socket.send.mock.calls.map(([value]) => JSON.parse(value)))
      .filter(message => message.type === 'duplicateSession')
    expect(copies).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(result.current.duplicationOperation).toMatchObject({ phase: 'unknown' })
    expect(result.current.errorMessage).toContain('副本可能已经创建')
    act(() => result.current.duplicateSession('source'))
    expect(result.current.duplicationOperation?.phase).toBe('unknown')
    act(() => TestSocket.sockets[1].receive(ready('late-copy')))
    expect(result.current.duplicationOperation).toMatchObject({ phase: 'success', targetSessionId: 'late-copy' })
  })
  it('续问建议只属于当前原生轮次，发送和切换会话会清除它', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const old = TestSocket.sockets[0]
    act(() => { old.open(); old.receive(ready('a')) })
    await waitFor(() => expect(result.current.items).toEqual(page('a').items))
    const prediction: Extract<ServerMessage, { type: 'codexPrediction' }> = {
      type: 'codexPrediction', seq: 3, sessionId: 'a', sdkSessionId: 'sdk-a', sourceTurnId: 'turn-a', text: '检查本轮变更',
    }
    act(() => {
      old.receive({ type: 'forkAnchor', seq: 2, anchor: 'turn-a' })
      old.receive(prediction)
    })
    expect(result.current.followUpPrediction).toMatchObject(prediction)
    act(() => old.receive({ ...prediction, seq: 4, sourceTurnId: 'older-turn' }))
    expect(result.current.followUpPrediction?.sourceTurnId).toBe('turn-a')
    act(() => result.current.send('下一轮'))
    expect(result.current.followUpPrediction).toBeNull()
    act(() => old.receive({ ...prediction, seq: 5 }))
    expect(result.current.followUpPrediction).toBeNull()
    act(() => result.current.switchTo('b'))
    act(() => old.receive({ ...prediction, seq: 6 }))
    expect(result.current.followUpPrediction).toBeNull()
    expect(result.current.sessionId).toBe('b')
  })

  it('切换后旧连接的输出和ready不能污染新会话或它的缓存', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const old = TestSocket.sockets[0]
    act(() => { old.open(); old.receive(ready('a')) })
    await waitFor(() => expect(result.current.items).toEqual(page('a').items))
    expect(api.loadMessages).toHaveBeenCalledWith('sdk-a', '', null, 30, 'a')

    act(() => result.current.switchTo('b'))
    act(() => old.receive({ type: 'assistantDelta', seq: 10, text: '旧会话输出' }))
    expect(result.current.items).toEqual([])
    act(() => old.receive(ready('a')))
    expect(result.current.sessionId).toBe('b')
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(2))
    const current = TestSocket.sockets[1]
    act(() => { current.open(); current.receive(ready('b')) })
    await waitFor(() => expect(result.current.items).toEqual(page('b').items))
    expect(api.loadMessages).toHaveBeenCalledWith('sdk-b', '', null, 30, 'b')
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
