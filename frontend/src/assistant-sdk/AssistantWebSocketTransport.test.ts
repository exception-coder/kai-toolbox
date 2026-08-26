import { describe, expect, it, vi } from 'vitest'
import { AssistantWebSocketTransport } from './AssistantWebSocketTransport'
import type { AssistantContextSnapshot, AssistantWidgetState } from './types'

class FakeWebSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING
  readonly sent: string[] = []

  open(): void {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  fail(): void {
    this.dispatchEvent(new Event('error'))
  }

  send(value: string): void {
    this.sent.push(value)
  }

  close(): void {
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close'))
  }
}

const snapshot: AssistantContextSnapshot = {
  protocolVersion: '1.0',
  application: { appId: 'ERP' },
  contributions: {},
  unavailableProviders: [],
  capturedAt: 1,
}

describe('AssistantWebSocketTransport', () => {
  it('returns to the login state instead of opening a websocket without a required token', () => {
    const factory = vi.fn()
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(), authenticationRequired: true,
      getAccessToken: () => { throw new Error('Forge 登录已失效，请重新登录') },
      webSocketFactory: factory,
    })
    transport.start(state => states.push(state))

    transport.submit({ mode: 'QUESTION', text: '认证测试', snapshot })

    expect(factory).not.toHaveBeenCalled()
    expect(states.at(-1)).toMatchObject({
      state: '认证失败', authenticationRequired: true, message: 'Forge 登录已失效，请重新登录',
    })
    transport.destroy()
  })

  it('reconnects immediately after authentication and keeps the queued message', () => {
    const sockets: FakeWebSocket[] = []
    let accessToken: string | undefined
    let requestedUrl = ''
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(), authenticationRequired: true,
      getAccessToken: () => {
        if (!accessToken) throw new Error('Forge 登录已失效，请重新登录')
        return accessToken
      },
      webSocketFactory: url => {
        requestedUrl = url
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
    })
    transport.start(() => undefined)
    transport.submit({ mode: 'QUESTION', text: '登录后继续发送', snapshot })

    expect(sockets).toHaveLength(0)
    accessToken = 'new-access-token'
    transport.resumeAfterAuthentication()

    expect(sockets).toHaveLength(1)
    expect(new URL(requestedUrl).searchParams.get('access_token')).toBe('new-access-token')
    sockets[0].open()
    sockets[0].receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })
    expect(sentByType(sockets[0], 'send')).toMatchObject({ text: '登录后继续发送' })
    transport.destroy()
  })

  it('resolves an access token only for the websocket handshake URL', () => {
    const socket = new FakeWebSocket()
    let requestedUrl = ''
    const storage = memoryStorage()
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws?tenant=erp', storage,
      getAccessToken: () => 'short lived/token',
      webSocketFactory: url => {
        requestedUrl = url
        return socket as unknown as WebSocket
      },
    })
    transport.start(() => undefined)
    transport.submit({ mode: 'QUESTION', text: '认证测试', snapshot })

    const url = new URL(requestedUrl)
    expect(url.searchParams.get('tenant')).toBe('erp')
    expect(url.searchParams.get('access_token')).toBe('short lived/token')
    expect(storage.getItem('kai-assistant:ws:ERP:anonymous')).not.toContain('short lived/token')
    transport.destroy()
  })

  it('opens a session, streams an answer and reaches the completed state', () => {
    const sockets: FakeWebSocket[] = []
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', projectKey: 'yoooni-one', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
    })
    transport.start(state => states.push(state))
    transport.submit({ mode: 'QUESTION', text: '为什么无法审核？', snapshot })

    sockets[0].open()
    expect(sent(sockets[0], 0)).toMatchObject({
      type: 'open', engine: 'codex', projectKey: 'yoooni-one',
    })
    sockets[0].receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })
    expect(sentByType(sockets[0], 'assistantContextSave')).toMatchObject({
      sessionId: 'session-1', protocolVersion: '1.0',
    })
    expect(sentByType(sockets[0], 'send')).toMatchObject({
      type: 'send', text: '为什么无法审核？', assistant: { mode: 'QUESTION' },
    })
    sockets[0].receive({ type: 'assistantDelta', seq: 2, text: '## 原因\n\n状态不允许。' })
    sockets[0].receive({ type: 'result', seq: 3, stopReason: 'end_turn' })

    expect(states.at(-1)?.state).toBe('已完成')
    expect(states.at(-1)?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '为什么无法审核？' }),
      expect.objectContaining({ role: 'assistant', content: '## 原因\n\n状态不允许。', streaming: false }),
    ]))
    transport.destroy()
  })

  it('scopes feedback archive requests to the ready session', async () => {
    const socket = new FakeWebSocket()
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ items: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      storage: memoryStorage(), fetcher,
      webSocketFactory: () => socket as unknown as WebSocket,
    })

    expect(await transport.listSessions()).toEqual({ items: [] })
    expect(fetcher).not.toHaveBeenCalled()

    transport.start(() => undefined)
    transport.submit({ mode: 'QUESTION', text: '查询当前会话归档', snapshot })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })
    await transport.listSessions()

    const requestedUrl = new URL(String(fetcher.mock.calls[0][0]))
    expect(requestedUrl.pathname).toBe('/api/assistant/feedback-sessions')
    expect(requestedUrl.searchParams.get('sessionId')).toBe('session-1')
    transport.destroy()
  })

  it('rebinds archive scope after a page URL change and ignores the old socket', async () => {
    const sockets: FakeWebSocket[] = []
    const states: AssistantWidgetState[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const body = url.pathname === '/api/assistant/feedback-sessions'
        ? { items: [] }
        : { items: [], nextBefore: null, transcriptMissing: false }
      return new Response(JSON.stringify(body), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    })
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      page: { url: 'https://erp.example.com/orders' }, storage: memoryStorage(), fetcher,
      webSocketFactory: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
    })
    transport.start(state => states.push(state))
    sockets[0].open()
    sockets[0].receive({ type: 'ready', seq: 1, sessionId: 'orders-session', status: 'IDLE', epoch: 'orders' })

    transport.updateContext({ page: { url: 'https://erp.example.com/inventory' } })

    expect(states.filter(state => state.state).at(-1)?.state).toBe('正在载入页面会话')
    expect(sockets).toHaveLength(2)
    sockets[0].fail()
    expect(states.some(state => state.state === '助手暂不可用')).toBe(false)
    sockets[0].receive({ type: 'ready', seq: 2, sessionId: 'late-orders-session', status: 'IDLE', epoch: 'orders' })
    expect(await transport.listSessions()).toEqual({ items: [] })

    sockets[1].open()
    expect(sentByType(sockets[1], 'open')).toMatchObject({
      assistantPageKey: 'https://erp.example.com/inventory',
    })
    sockets[1].fail()
    expect(states.filter(state => state.state).at(-1)?.state).toBe('正在载入页面会话')
    expect(states.filter(state => state.message).at(-1)?.message).not.toBe('WebSocket 连接失败')
    sockets[1].receive({ type: 'ready', seq: 1, sessionId: 'inventory-session', status: 'IDLE', epoch: 'inventory' })
    await transport.listSessions()

    const archiveRequest = fetcher.mock.calls.map(call => new URL(String(call[0])))
      .findLast(url => url.pathname === '/api/assistant/feedback-sessions')
    expect(archiveRequest?.searchParams.get('sessionId')).toBe('inventory-session')
    transport.destroy()
  })

  it('keeps a fixed page in the session connection state when the socket closes before ready', () => {
    const socket = new FakeWebSocket()
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      page: { url: 'https://erp.example.com/orders' }, storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })

    transport.start(state => states.push(state))
    socket.close()

    expect(states.filter(state => state.state).at(-1)).toMatchObject({
      state: '正在载入页面会话', message: undefined,
    })
    transport.destroy()
  })

  it('resolves a fixed page conversation and progressively loads transcript history', async () => {
    const socket = new FakeWebSocket()
    const states: AssistantWidgetState[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/attachments/att-1')) {
        return new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 })
      }
      const before = url.searchParams.get('before')
      return new Response(JSON.stringify(before ? {
        items: [{ id: 'h1', role: 'user', content: '更早的问题', timestamp: 1 }],
        nextBefore: 0, transcriptMissing: false,
      } : {
        items: [
          { id: 'h2', role: 'user', content: '近期问题', timestamp: 2,
            attachments: [{ id: 'att-1', name: 'screen.png', mime: 'image/png', size: 5 }] },
          { id: 'h3', role: 'assistant', content: '近期回答', timestamp: 3 },
        ],
        nextBefore: 2, transcriptMissing: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const storage = memoryStorage()
    const transport = new AssistantWebSocketTransport({
      appId: 'SCM', userId: '7', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      page: { url: 'https://scm.example.com/progress.action?style=25D332&access_token=secret' },
      storage, fetcher, webSocketFactory: () => socket as unknown as WebSocket,
    })

    transport.start(state => states.push(state))
    socket.open()
    expect(sentByType(socket, 'open')).toMatchObject({
      assistantAppId: 'SCM',
      assistantPageKey: 'https://scm.example.com/progress.action?style=25D332',
    })
    socket.receive({ type: 'ready', seq: 1, sessionId: 'fixed-session', status: 'IDLE', epoch: 'e1' })

    await vi.waitFor(() => expect(states.at(-1)?.messages).toEqual([
      expect.objectContaining({ id: 'h2', content: '近期问题', attachments: [
        expect.objectContaining({ id: 'att-1', name: 'screen.png' }),
      ] }),
      expect.objectContaining({ id: 'h3', content: '近期回答' }),
    ]))
    await expect(transport.loadConversationAttachment('att-1')).resolves.toBeInstanceOf(Blob)
    transport.loadEarlier()
    await vi.waitFor(() => expect(states.at(-1)?.messages?.map(message => message.id)).toEqual(['h1', 'h2', 'h3']))
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining('before=2'), expect.any(Object),
    )
    const persisted = Array.from({ length: storage.length }, (_, index) =>
      storage.getItem(storage.key(index) ?? '')).join('')
    expect(persisted).not.toContain('近期回答')
    transport.destroy()
  })

  it('uploads pasted images after the session is ready and sends only server attachment references', async () => {
    const socket = new FakeWebSocket()
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      id: 'att-1', name: 'screen.png', mime: 'image/png', size: 3,
      path: 'D:/workspace/.kai-chat-attachments/session-1/screen.png',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      storage: memoryStorage(), getAccessToken: () => 'access-token', fetcher,
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(state => states.push(state))
    transport.submit({
      mode: 'DIAGNOSE', text: '', snapshot,
      attachments: [{
        id: 'local-1', name: 'screen.png', mime: 'image/png', size: 3,
        file: new File([new Uint8Array([1, 2, 3])], 'screen.png', { type: 'image/png' }),
      }],
    })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(sentByType(socket, 'send')).toMatchObject({
      text: '',
      attachments: [{
        name: 'screen.png', mime: 'image/png',
        path: 'D:/workspace/.kai-chat-attachments/session-1/screen.png',
      }],
    }))
    const [url, request] = fetcher.mock.calls[0]
    expect(url).toBe('https://forge.example.com/api/claude-chat/sessions/session-1/attachments')
    expect(request?.headers).toEqual({ Authorization: 'Bearer access-token' })
    expect(states.some(state => state.state === '正在上传图片')).toBe(true)
    expect(states.some(state => state.submissionAccepted)).toBe(true)
    transport.destroy()
  })

  it('restores the original submission when image upload fails', async () => {
    const socket = new FakeWebSocket()
    const states: AssistantWidgetState[] = []
    const file = new File(['image'], 'screen.png', { type: 'image/png' })
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      fetcher: vi.fn(async () => new Response('{}', { status: 500 })),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(state => states.push(state))
    transport.submit({
      mode: 'BUG', text: '请看截图', snapshot,
      attachments: [{ id: 'local-1', name: 'screen.png', mime: 'image/png', size: file.size, file }],
    })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

    await vi.waitFor(() => expect(states.at(-1)).toMatchObject({
      state: '图片上传失败', failedSubmission: { text: '请看截图' },
    }))
    expect(states.at(-1)?.failedSubmission?.attachments?.[0].file).toBe(file)
    expect(socket.sent.map(value => JSON.parse(value))).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'send' }),
    ]))
    transport.destroy()
  })

  it('injects a cached module exploration summary before the first turn', () => {
    const socket = new FakeWebSocket()
    const moduleSnapshot: AssistantContextSnapshot = {
      ...snapshot, application: { appId: 'ERP', sourceRevision: 'v1' },
      page: { url: 'https://erp.example/orders/42', routeName: 'order-detail' },
    }
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(() => undefined)
    transport.submit({ mode: 'QUESTION', text: '为什么无法审核？', snapshot: moduleSnapshot })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

    const resolve = sentByType(socket, 'assistantModuleContextResolve')
    expect(socket.sent.map(value => JSON.parse(value))).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'send' }),
    ]))
    socket.receive({
      type: 'assistantCommandResult', seq: 0, requestId: resolve.requestId,
      action: 'moduleContextResolve', success: true,
      data: { found: true, summary: '订单审核依赖状态机', sourceRevision: 'v1', updatedAt: 10, expiresAt: 20 },
    })

    const sendMessage = sentByType(socket, 'send')
    expect(sendMessage).toMatchObject({
      assistant: { contextSnapshot: { contributions: {
        assistantModuleExploration: { summary: '订单审核依赖状态机', trust: 'historical-clue' },
      } } },
    })
    transport.destroy()
  })

  it('writes a bounded module summary after a cache miss completes', () => {
    const socket = new FakeWebSocket()
    const moduleSnapshot: AssistantContextSnapshot = {
      ...snapshot,
      page: { url: 'https://erp.example/orders/42', routeName: 'order-detail' },
    }
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(() => undefined)
    transport.submit({ mode: 'QUESTION', text: '探索这个模块', snapshot: moduleSnapshot })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })
    const resolve = sentByType(socket, 'assistantModuleContextResolve')
    socket.receive({
      type: 'assistantCommandResult', seq: 0, requestId: resolve.requestId,
      action: 'moduleContextResolve', success: true, data: { found: false },
    })
    socket.receive({ type: 'assistantDelta', seq: 2, text: '模块探索结论' })
    socket.receive({ type: 'result', seq: 3, stopReason: 'end_turn' })

    expect(sentByType(socket, 'assistantModuleContextSave')).toMatchObject({
      appId: 'ERP', moduleKey: 'order-detail', summary: '模块探索结论',
    })
    transport.destroy()
  })

  it('falls back to the live turn when the module lookup times out', async () => {
    vi.useFakeTimers()
    const socket = new FakeWebSocket()
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    try {
      transport.start(() => undefined)
      transport.submit({ mode: 'QUESTION', text: '超时也要继续', snapshot: moduleSnapshot() })
      socket.open()
      socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

      expect(socket.sent.map(value => JSON.parse(value))).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'send' }),
      ]))
      await vi.advanceTimersByTimeAsync(2_001)

      expect(sentByType(socket, 'send')).toMatchObject({ text: '超时也要继续' })
    } finally {
      transport.destroy()
      vi.useRealTimers()
    }
  })

  it('does not cache a partial answer when the turn is interrupted', () => {
    const socket = new FakeWebSocket()
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(() => undefined)
    transport.submit({ mode: 'QUESTION', text: '探索后中断', snapshot: moduleSnapshot() })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })
    const resolve = sentByType(socket, 'assistantModuleContextResolve')
    socket.receive({
      type: 'assistantCommandResult', seq: 0, requestId: resolve.requestId,
      action: 'moduleContextResolve', success: true, data: { found: false },
    })
    socket.receive({ type: 'assistantDelta', seq: 2, text: '未完成结论' })

    transport.interrupt()
    socket.receive({ type: 'result', seq: 3, stopReason: 'interrupted' })

    expect(socket.sent.map(value => JSON.parse(value))).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'assistantModuleContextSave' }),
    ]))
    transport.destroy()
  })

  it('retries an in-flight module lookup after reconnecting', async () => {
    vi.useFakeTimers()
    const sockets: FakeWebSocket[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
    })
    try {
      transport.start(() => undefined)
      transport.submit({ mode: 'QUESTION', text: '重连后继续', snapshot: moduleSnapshot() })
      sockets[0].open()
      sockets[0].receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })
      expect(sentByType(sockets[0], 'assistantModuleContextResolve')).toBeDefined()

      sockets[0].close()
      await vi.advanceTimersByTimeAsync(500)
      sockets[1].open()
      sockets[1].receive({ type: 'ready', seq: 2, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

      expect(sentByType(sockets[1], 'assistantModuleContextResolve')).toBeDefined()
    } finally {
      transport.destroy()
      vi.useRealTimers()
    }
  })

  it('interrupts the active websocket turn and exposes only protocol metadata in debug logs', () => {
    const socket = new FakeWebSocket()
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      getAccessToken: () => 'sensitive-access-token',
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(state => states.push(state))
    transport.submit({ mode: 'QUESTION', text: '敏感问题正文', snapshot })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

    transport.interrupt()

    expect(sentByType(socket, 'interrupt')).toEqual({ type: 'interrupt' })
    expect(states.at(-1)?.state).toBe('正在中止')
    socket.receive({ type: 'result', seq: 2, stopReason: 'interrupted' })
    expect(states.at(-1)?.state).toBe('已中止')
    const debugText = JSON.stringify(states.map(state => state.debugEntry).filter(Boolean))
    expect(debugText).not.toContain('敏感问题正文')
    expect(debugText).not.toContain('sensitive-access-token')
    expect(debugText).toContain('发送 WebSocket 消息')
    transport.destroy()
  })

  it('persists a second message through the websocket queue while a turn is running', () => {
    const socket = new FakeWebSocket()
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: 'wss://assistant.example/ws', storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(state => states.push(state))
    transport.submit({ mode: 'QUESTION', text: '第一条', snapshot })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })
    transport.submit({ mode: 'DIAGNOSE', text: '第二条', snapshot })

    expect(socket.sent.map(value => JSON.parse(value))).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'queue', text: '第二条' }),
    ]))
    const queued = sentByType(socket, 'queue')
    socket.receive({ type: 'queueAccepted', seq: 2, messageId: queued.id, queueSize: 1 })
    expect(states.at(-1)?.queueSize).toBe(1)
    expect(states.at(-1)?.state).toBe('回复中')
    transport.destroy()
  })

  it('creates and confirms a draft through the same websocket', () => {
    const socket = new FakeWebSocket()
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(state => states.push(state))
    transport.submit({ mode: 'BUG', text: '订单审核失败', snapshot })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

    transport.saveDraft({ kind: 'BUG', title: '订单审核失败', description: '接口返回 500', snapshot })
    expect(sentByType(socket, 'assistantDraftCreate')).toMatchObject({
      sessionId: 'session-1', kind: 'BUG', title: '订单审核失败',
    })
    socket.receive({
      type: 'assistantCommandResult', seq: 0, requestId: 'request-1', action: 'draftCreate',
      success: true, data: { draftId: 'draft-1', status: 'DRAFT' },
    })
    transport.confirmDraft('draft-1', 7)

    expect(sentByType(socket, 'assistantDraftConfirm')).toMatchObject({
      draftId: 'draft-1', engineerUserId: 7,
    })
    socket.receive({
      type: 'assistantCommandResult', seq: 0, requestId: 'request-2', action: 'draftConfirm',
      success: true, data: { draftId: 'draft-1', requirementId: 'REQ-1', alreadySaved: false },
    })
    expect(states.at(-1)?.state).toBe('已保存')
    transport.destroy()
  })

  it('analyzes the completed conversation without surfacing classification controls', () => {
    const socket = new FakeWebSocket()
    const states: AssistantWidgetState[] = []
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage: memoryStorage(),
      webSocketFactory: () => socket as unknown as WebSocket,
    })
    transport.start(state => states.push(state))
    transport.submit({ mode: 'AUTO', text: '导出按钮点击后报错', snapshot })
    socket.open()
    socket.receive({ type: 'ready', seq: 1, sessionId: 'session-1', status: 'IDLE', epoch: 'e1' })

    socket.receive({ type: 'result', seq: 2, stopReason: 'end_turn' })

    expect(sentByType(socket, 'assistantConversationAnalyze')).toMatchObject({ sessionId: 'session-1' })
    const visibleStateCount = states.filter(state =>
      state.state || state.message || state.detectedIntent || state.detectionConfidence).length
    socket.receive({
      type: 'assistantCommandResult', seq: 0, requestId: 'analysis-1', action: 'conversationAnalysis',
      success: true,
      data: {
        fromWatermark: 0, toWatermark: 20, advanced: true, caughtUp: true,
        detections: [{ sourceWatermark: 10, intent: 'BUG', confidence: 0.93, reason: '已有功能报错' }],
      },
    })

    expect(states.filter(state =>
      state.state || state.message || state.detectedIntent || state.detectionConfidence)).toHaveLength(visibleStateCount)
    expect(states.some(state => state.detectedIntent || state.state === '已识别反馈')).toBe(false)
    expect(states.at(-1)?.feedbackArchiveChanged).toBe(true)
    transport.destroy()
  })

  it('attaches with the persisted watermark after reconnecting', () => {
    vi.useFakeTimers()
    const sockets: FakeWebSocket[] = []
    const storage = memoryStorage()
    const transport = new AssistantWebSocketTransport({
      appId: 'ERP', wsUrl: '/assistant/ws', storage,
      webSocketFactory: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
    })
    transport.start(() => undefined)
    transport.submit({ mode: 'QUESTION', text: '恢复测试', snapshot })
    sockets[0].open()
    sockets[0].receive({ type: 'ready', seq: 8, sessionId: 'session-8', status: 'RUNNING', epoch: 'e1' })
    sockets[0].close()
    vi.advanceTimersByTime(500)
    sockets[1].open()

    expect(sent(sockets[1], 0)).toEqual({ type: 'attach', sessionId: 'session-8', lastEventSeq: 8 })
    transport.destroy()
    vi.useRealTimers()
  })
})

function sent(socket: FakeWebSocket, index: number): Record<string, unknown> {
  return JSON.parse(socket.sent[index]) as Record<string, unknown>
}

function sentByType(socket: FakeWebSocket, type: string): Record<string, unknown> {
  const message = socket.sent.map(value => JSON.parse(value) as Record<string, unknown>)
    .find(value => value.type === type)
  if (!message) throw new Error(`No message with type ${type}`)
  return message
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

function moduleSnapshot(): AssistantContextSnapshot {
  return {
    ...snapshot,
    page: { url: 'https://erp.example/orders/42', routeName: 'order-detail' },
  }
}
