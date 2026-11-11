import { useEffect } from 'react'
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClaudeChatSocket } from './useClaudeChatSocket'
import { ApiError } from '@/lib/api'
import type { ChatItem, ServerMessage } from '../types'

const api = vi.hoisted(() => ({
  loadMessages: vi.fn(), listQueuedMessages: vi.fn().mockResolvedValue([]), requestSessionCopy: vi.fn(),
  stopQueuedMessage: vi.fn(), pauseQueuedMessage: vi.fn(), deleteQueuedMessage: vi.fn(), clearQueuedMessages: vi.fn(),
}))
vi.mock('../api', () => ({ ...api, loadPublicReviewMessages: vi.fn(), saveQueuedMessage: vi.fn() }))
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
  api.requestSessionCopy.mockImplementation((sourceSessionId: string, requestId: string) =>
    Promise.resolve({ sourceSessionId, requestId, targetSessionId: 'copy' }))
  TestSocket.sockets = []
  vi.stubGlobal('WebSocket', TestSocket)
  api.loadMessages.mockImplementation((id: string | null, _cwd: string, _before: unknown, _limit: number, sessionId: string) =>
    Promise.resolve(page(id?.replace('sdk-', '') ?? sessionId)))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('Codex 会话参数恢复', () => {
  it('Claude 强度按会话恢复，重放不回写，主动修改只发送配置消息', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('claude-a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive({ ...ready('claude-a'), engine: 'claude',
      claudeOptions: { effort: 'max', ultracode: true } }) })
    expect(result.current.claudeOptions).toEqual({ effort: 'max', ultracode: true })
    act(() => socket.receive({ type: 'modelConfiguration', seq: 2, activeModelConfiguration: {
      engine: 'claude', model: 'opus', effort: 'high', speed: null, ultracode: false,
    } }))
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'setClaudeOptions')).toEqual([])
    act(() => result.current.setClaudeOptions({ effort: 'auto', ultracode: false }))
    expect(result.current.activeModelConfiguration?.effort).toBe('high')
    expect(result.current.claudeOptions.effort).toBe('auto')
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'setClaudeOptions'))
      .toEqual([{ type: 'setClaudeOptions', effort: 'auto', ultracode: false }])
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'send')).toEqual([])
    act(() => socket.receive({ type: 'error', seq: 3, code: 'COMMAND_FAILED', message: '保存失败', terminal: false }))
    expect(result.current.claudeOptions).toEqual({ effort: 'max', ultracode: true })
    act(() => result.current.switchTo('claude-b'))
    expect(result.current.claudeOptions).toEqual({ effort: 'auto', ultracode: false })
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(2))
    act(() => { TestSocket.sockets[1].open(); TestSocket.sockets[1].receive({ ...ready('claude-b'), engine: 'claude' }) })
    expect(result.current.claudeOptions).toEqual({ effort: 'auto', ultracode: false })
  })

  it('配置被拒绝不会把正在运行的轮次标记为结束', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('active'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive({ ...ready('active'), status: 'RUNNING', activeTurnId: 'turn-1' }) })
    expect(result.current.running).toBe(true)
    act(() => socket.receive({ type: 'error', seq: 2, code: 'CLAUDE_OPTIONS_UNSUPPORTED', message: '配置不可用', terminal: true }))
    expect(result.current.running).toBe(true)
  })

  it('暂停核对仅调用暂停接口并保留队首，不发送或删除消息', async () => {
    const current = { id: 'pause-head', sessionId: 'a', text: 'keep task', createdAt: 1, deliveryState: 'CHECKING' }
    api.listQueuedMessages.mockResolvedValueOnce([current])
    api.pauseQueuedMessage.mockResolvedValue(undefined)
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    act(() => { TestSocket.sockets[0].open(); TestSocket.sockets[0].receive(ready('a')) })
    await waitFor(() => expect(result.current.queued).toHaveLength(1))
    api.listQueuedMessages.mockResolvedValueOnce([{ ...current, deliveryState: 'PAUSED' }])
    await act(async () => { await result.current.pauseQueued('pause-head') })
    expect(api.pauseQueuedMessage).toHaveBeenCalledWith('a', 'pause-head')
    expect(result.current.queued[0].deliveryState).toBe('PAUSED')
    expect(result.current.queuePausedReason).toContain('暂停')
    expect(api.deleteQueuedMessage).not.toHaveBeenCalled()
    expect(api.stopQueuedMessage).not.toHaveBeenCalled()
    expect(TestSocket.sockets[0].send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'send')).toEqual([])
  })
  it('删除成功后迟到的队列快照不能把同一消息恢复到页面', async () => {
    const stale = [{ id: 'deleted', sessionId: 'a', text: 'do not restore', createdAt: 1 }]
    api.listQueuedMessages.mockResolvedValue(stale)
    api.deleteQueuedMessage.mockResolvedValue(undefined)
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    act(() => { TestSocket.sockets[0].open(); TestSocket.sockets[0].receive(ready('a')) })
    await waitFor(() => expect(result.current.queued).toHaveLength(1))
    await act(async () => { await result.current.removeQueued('deleted') })
    expect(result.current.queued).toEqual([])
    expect(api.deleteQueuedMessage).toHaveBeenCalledWith('a', 'deleted')
    api.listQueuedMessages.mockResolvedValue([])
  })
  it('刷新回放旧标准速度时不覆盖已保存的快速设置，连续刷新仍恢复快速', async () => {
    let savedSpeed: 'default' | 'fast' = 'fast'
    for (let refresh = 0; refresh < 2; refresh++) {
      const { result, unmount } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
      act(() => result.current.switchTo('speed-replay'))
      await waitFor(() => expect(TestSocket.sockets).toHaveLength(refresh + 1))
      const socket = TestSocket.sockets[refresh]
      // 模拟服务端收到浏览器回写后，再构造 attach 结束时的当前快照。
      socket.send.mockImplementation((value: string) => {
        const message = JSON.parse(value)
        if (message.type === 'setCodexOptions') savedSpeed = message.speed
      })
      act(() => {
        socket.open()
        socket.receive({ ...ready('speed-replay'), codexReasoningEffort: 'low', codexSpeed: 'default' })
      })
      act(() => socket.receive({ ...ready('speed-replay'), seq: 3, codexReasoningEffort: 'high', codexSpeed: savedSpeed }))
      expect(result.current.codexSpeed).toBe('fast')
      expect(result.current.codexReasoningEffort).toBe('high')
      expect(savedSpeed).toBe('fast')
      expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))
        .filter(message => message.type === 'setCodexOptions')).toEqual([])
      unmount()
    }
  })

  it('服务端参数优先于本机缓存，只有用户修改参数时才保存一次', async () => {
    const key = 'kai-toolbox:codex-options:speed-authority'
    localStorage.setItem(key, JSON.stringify({ reasoningEffort: 'low', speed: 'default' }))
    try {
      const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
      act(() => result.current.switchTo('speed-authority'))
      await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
      const socket = TestSocket.sockets[0]
      act(() => {
        socket.open()
        socket.receive({ ...ready('speed-authority'), codexReasoningEffort: 'high', codexSpeed: 'fast' })
        socket.receive({ type: 'models', seq: 2, current: 'gpt-test', models: [] })
      })
      expect(result.current.codexSpeed).toBe('fast')
      expect(result.current.codexReasoningEffort).toBe('high')
      act(() => result.current.setCodexOptions('high', 'default'))
      expect(result.current.codexSpeed).toBe('default')
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ reasoningEffort: 'high', speed: 'default' })
      expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))
        .filter(message => message.type === 'setCodexOptions'))
        .toEqual([{ type: 'setCodexOptions', reasoningEffort: 'high', speed: 'default' }])
    } finally { localStorage.removeItem(key) }
  })

  it('兼容旧服务端缺省字段时只读缓存，不把恢复操作变成配置修改', async () => {
    const key = 'kai-toolbox:codex-options:speed-legacy'
    localStorage.setItem(key, JSON.stringify({ reasoningEffort: 'high', speed: 'fast' }))
    try {
      const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
      act(() => result.current.switchTo('speed-legacy'))
      await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
      const socket = TestSocket.sockets[0]
      act(() => { socket.open(); socket.receive(ready('speed-legacy')) })
      expect(result.current.codexSpeed).toBe('fast')
      expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))
        .filter(message => message.type === 'setCodexOptions')).toEqual([])
    } finally { localStorage.removeItem(key) }
  })
})

describe('会话消息隔离', () => {
  it('普通工作台按服务端评审策略禁止开发命令，并在当前回答后发送本页排队讨论', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('review'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive({ ...ready('review'), executionPolicy: 'review-only', status: 'RUNNING' }) })
    expect(result.current.reviewOnly).toBe(true)
    socket.send.mockClear()
    act(() => { result.current.setAutoApprove(true); result.current.steer('不应插入'); result.current.enqueue('后续评审问题') })
    expect(socket.send.mock.calls).toHaveLength(0)
    expect(result.current.queued).toHaveLength(1)
    act(() => socket.receive({ type: 'result', seq: 8, usage: {}, stopReason: 'success' }))
    await waitFor(() => expect(socket.send.mock.calls.map(([value]) => JSON.parse(value)).some(message => message.type === 'send' && message.text === '后续评审问题')).toBe(true))
    expect(result.current.queued).toHaveLength(0)
  })
  it('子页面首次挂载即可并行恢复历史，不依赖父级 effect 顺序', async () => {
    function InitialSwitch({ switchTo }: { switchTo: (id: string) => void }) {
      useEffect(() => { switchTo('initial') }, [switchTo])
      return null
    }
    function Harness() {
      const chat = useClaudeChatSocket({ autoConnect: false })
      return <><InitialSwitch switchTo={chat.switchTo} /><span>{chat.items.length}</span></>
    }
    const view = render(<Harness />)
    await waitFor(() => expect(view.getByText('1')).toBeTruthy())
    expect(api.loadMessages).toHaveBeenCalledTimes(1)
    expect(api.loadMessages).toHaveBeenCalledWith(null, '', null, 30, 'initial')
  })

  it('连接未就绪即可显示最近历史，ready 不重复读取', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('parallel'))
    expect(api.loadMessages).toHaveBeenCalledWith(null, '', null, 30, 'parallel')
    await waitFor(() => expect(result.current.items).toEqual(page('parallel').items))
    expect(result.current.historyLoading).toBe(false)
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive(ready('parallel')) })
    expect(api.loadMessages).toHaveBeenCalledTimes(1)
  })

  it('先到的空句柄 ready 不提前结束历史请求，失败后仍可重试', async () => {
    let fail!: (reason: Error) => void
    api.loadMessages.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('parallel'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    act(() => { TestSocket.sockets[0].open(); TestSocket.sockets[0].receive({ ...ready('parallel'), sdkSessionId: null }) })
    expect(result.current.historyLoading).toBe(true)
    await act(async () => fail(new Error('读取超时')))
    expect(result.current.historyError).toBeTruthy()
    await act(async () => { await result.current.loadHistory(true) })
    expect(result.current.items).toEqual(page('parallel').items)
    expect(result.current.historyError).toBeNull()
  })

  it('字节游标失效后由用户重试最近页，超大单轮提供明确兼容读取', async () => {
    api.loadMessages.mockResolvedValueOnce({ ...page('a'), nextBefore: 'cursor-a' })
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    act(() => { TestSocket.sockets[0].open(); TestSocket.sockets[0].receive(ready('a')) })
    await waitFor(() => expect(result.current.items).toEqual(page('a').items))
    api.loadMessages.mockRejectedValueOnce(new ApiError(409, {}, 'changed'))
    await act(async () => { await result.current.loadHistory(false) })
    expect(result.current.historyError).toContain('重新加载最近消息')
    api.loadMessages.mockRejectedValueOnce(new ApiError(413, {}, 'large'))
    await act(async () => { await result.current.loadHistory(false) })
    expect(api.loadMessages).toHaveBeenLastCalledWith('sdk-a', '', null, 30, 'a')
    expect(result.current.historyError).toContain('完整历史读取')
    api.loadMessages.mockResolvedValueOnce(page('latest'))
    await act(async () => { await result.current.loadHistory(false) })
    expect(api.loadMessages).toHaveBeenLastCalledWith('sdk-a', '', null, 30, 'a', true)
    expect(result.current.items).toEqual(page('latest').items)
  })
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

  it('普通复制只写一次配置，未收到引擎 Ready 也确认副本并清除旧消息', async () => {
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('source'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive(ready('source')) })
    await waitFor(() => expect(result.current.items).toEqual(page('source').items))
    api.loadMessages.mockResolvedValueOnce({ items: [], nextBefore: null })
    act(() => {
      result.current.duplicateSession('source', 'C:/Users/test/.codex')
      result.current.duplicateSession('source', 'C:/Users/test/.codex')
      result.current.dismissDuplication()
    })
    expect(result.current.duplicationOperation).toMatchObject({ sourceSessionId: 'source', phase: 'pending', authSwitch: false })
    const copies = socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'duplicateSession')
    expect(copies).toEqual([])
    expect(api.requestSessionCopy).toHaveBeenCalledOnce()
    await waitFor(() => expect(result.current.sessionId).toBe('copy'))
    expect(result.current.duplicationOperation).toMatchObject({ phase: 'success', targetSessionId: 'copy' })
    expect(result.current.sessionId).toBe('copy')
    expect(result.current.items).toEqual([])
    expect(result.current.duplicatingSessionId).toBeNull()
    const targetSocket = TestSocket.sockets.at(-1)!
    act(() => { targetSocket.open(); targetSocket.receive({ type: 'error', seq: 0, code: 'SIDECAR_DOWN', message: '引擎断线', terminal: false }) })
    expect(result.current.duplicationOperation?.phase).toBe('success')
    act(() => result.current.dismissDuplication())
    expect(result.current.duplicationOperation).toBeNull()
  })

  it('复制未返回时切换到其他会话，迟到回执不抢回视图', async () => {
    let finish!: (result: { sourceSessionId: string; requestId: string; targetSessionId: string }) => void
    api.requestSessionCopy.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.duplicateSession('source'))
    const requestId = api.requestSessionCopy.mock.calls.at(-1)![1] as string
    act(() => result.current.switchTo('other'))
    await act(async () => { finish({ sourceSessionId: 'source', requestId, targetSessionId: 'copy' }) })
    expect(result.current.sessionId).toBe('other')
    expect(result.current.duplicationOperation).toBeNull()
    expect(localStorage.getItem('kai-toolbox:pending-session-copy:source')).toBe(requestId)
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
    api.requestSessionCopy.mockRejectedValueOnce(new ApiError(403, null, '无权复制源会话'))
    act(() => result.current.duplicateSession('source'))
    await waitFor(() => expect(result.current.duplicationOperation).toMatchObject({ phase: 'error', message: '无权复制源会话' }))
    expect(result.current.duplicatingSessionId).toBeNull()
    expect(result.current.sessionId).toBe('source')
  })

  it('Auth 切换保留原有防重复发送边界', async () => {
    const { result } = renderHook(() => useClaudeChatSocket())
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    vi.useFakeTimers()
    act(() => result.current.duplicateSession('source', 'other-auth', '授权交接'))
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
    act(() => result.current.duplicateSession('source', 'other-auth', '授权交接'))
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
    expect(api.loadMessages).toHaveBeenCalledWith(null, '', null, 30, 'a')

    act(() => result.current.switchTo('b'))
    act(() => old.receive({ type: 'assistantDelta', seq: 10, text: '旧会话输出' }))
    expect(result.current.items).toEqual([])
    act(() => old.receive(ready('a')))
    expect(result.current.sessionId).toBe('b')
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(2))
    const current = TestSocket.sockets[1]
    act(() => { current.open(); current.receive(ready('b')) })
    await waitFor(() => expect(result.current.items).toEqual(page('b').items))
    expect(api.loadMessages).toHaveBeenCalledWith(null, '', null, 30, 'b')
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
    api.loadMessages.mockImplementationOnce(() => new Promise(() => {}))
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

  it('终止队列询问只请求原会话，切换后的迟到失败不污染当前会话', async () => {
    let rejectStop!: (reason: Error) => void
    api.stopQueuedMessage.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectStop = reject }))
    const { result } = renderHook(() => useClaudeChatSocket({ autoConnect: false }))
    act(() => result.current.switchTo('a'))
    await waitFor(() => expect(TestSocket.sockets).toHaveLength(1))
    const socket = TestSocket.sockets[0]
    act(() => { socket.open(); socket.receive(ready('a')) })
    act(() => { result.current.stopQueued('head-a') })
    expect(api.stopQueuedMessage).toHaveBeenCalledExactlyOnceWith('a', 'head-a')
    act(() => result.current.switchTo('b'))
    act(() => socket.receive(ready('b')))
    await act(async () => { rejectStop(new Error('原会话已断开')) })
    expect(result.current.sessionId).toBe('b')
    expect(result.current.syncWarning).toBeNull()
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value)).filter(message => message.type === 'send')).toEqual([])
  })
})
