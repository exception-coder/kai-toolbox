import { buildAssistantDeveloperInstructions } from './prompt'
import type {
  AssistantConversationMessage,
  AssistantDraftSubmission,
  AssistantSubmission,
  AssistantTransport,
  AssistantWidgetState,
} from './types'
import { createAssistantDebugEntry } from './assistantDebugLog'

const MAX_RECONNECT_DELAY_MS = 30_000
const BASE_RECONNECT_DELAY_MS = 500

export interface AssistantWebSocketTransportOptions {
  appId: string
  userId?: string
  wsUrl: string
  getAccessToken?: () => string | undefined | Promise<string | undefined>
  authenticationRequired?: boolean
  workspace?: string
  engine?: 'codex' | 'claude'
  webSocketFactory?: (url: string) => WebSocket
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

interface PendingSubmission {
  id: string
  submission: AssistantSubmission
  createdAt: number
}

interface PersistedConversation {
  sessionId?: string
  lastSeq: number
  epoch?: string
  messages: AssistantConversationMessage[]
  pending?: PendingSubmission[]
  awaitingQueueAck?: PendingSubmission[]
  draftId?: string
  idempotencyKeys?: Record<string, string>
}

type IncomingMessage = {
  type: string
  seq?: number
  sessionId?: string
  status?: string
  epoch?: string
  text?: string
  stopReason?: string
  code?: string
  message?: string
  terminal?: boolean
  messageId?: string
  queueSize?: number
  displayText?: string
  createdAt?: number
  tasks?: unknown[]
  action?: string
  success?: boolean
  data?: unknown
  errorCode?: string
}

/** 框架无关的 Assistant WS 客户端，负责会话、水位、重连和持久排队。 */
export class AssistantWebSocketTransport implements AssistantTransport {
  private readonly options: AssistantWebSocketTransportOptions
  private readonly storageKey: string
  private listener: (state: AssistantWidgetState) => void = () => undefined
  private socket?: WebSocket
  private sessionId?: string
  private lastSeq = 0
  private epoch?: string
  private messages: AssistantConversationMessage[] = []
  private pending: PendingSubmission[] = []
  private awaitingQueueAck = new Map<string, PendingSubmission>()
  private running = false
  private backgroundTaskCount = 0
  private queueSize = 0
  private reconnectAttempts = 0
  private reconnectTimer?: number
  private destroyed = false
  private draftId?: string
  private idempotencyKeys: Record<string, string> = {}
  private pendingCommands: Array<() => void> = []
  private connecting = false
  private connectionVersion = 0

  constructor(options: AssistantWebSocketTransportOptions) {
    this.options = options
    this.storageKey = `kai-assistant:ws:${options.appId}:${options.userId ?? 'anonymous'}`
    this.restore()
  }

  start(listener: (state: AssistantWidgetState) => void): void {
    this.listener = listener
    this.debug('connection', 'Transport 已初始化')
    this.emit(this.messages.length > 0 ? '已恢复' : '已就绪')
  }

  submit(submission: AssistantSubmission): void {
    const pending = { id: createId(), submission, createdAt: Date.now() }
    this.pending.push(pending)
    this.messages.push({ id: `user-${pending.id}`, role: 'user', content: submission.text, timestamp: pending.createdAt })
    this.persist()
    this.debug('send', '请求已进入发送流程', { mode: submission.mode })
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.emit('正在连接')
      this.connect()
      return
    }
    this.flushPending()
  }

  saveDraft(submission: AssistantDraftSubmission): void {
    if (!this.sessionId) {
      this.emit('草稿保存失败', '请先发送一条消息以建立会话')
      return
    }
    this.ensureConnected(() => this.send({
      type: 'assistantDraftCreate', requestId: createId(), sessionId: this.sessionId,
      kind: submission.kind, title: submission.title, description: submission.description,
      contextSnapshot: submission.snapshot,
      evidence: {
        contributions: submission.snapshot.contributions,
        unavailableProviders: submission.snapshot.unavailableProviders,
      },
    }))
  }

  confirmDraft(draftId: string, engineerUserId?: number): void {
    const idempotencyKey = this.idempotencyKeys[draftId] ?? createId()
    this.idempotencyKeys[draftId] = idempotencyKey
    this.persist()
    this.ensureConnected(() => this.send({
      type: 'assistantDraftConfirm', requestId: createId(), draftId, idempotencyKey, engineerUserId,
    }))
  }

  listUsers(): void {
    this.ensureConnected(() => this.send({ type: 'assistantUsersList', requestId: createId() }))
  }

  interrupt(): void {
    this.debug('control', '用户请求中止当前回合')
    this.pending = []
    if (this.socket?.readyState === WebSocket.OPEN && this.sessionId
        && (this.running || this.backgroundTaskCount > 0)) {
      this.persist()
      this.send({ type: 'interrupt' })
      this.emit('正在中止')
      return
    }
    this.connectionVersion += 1
    const socket = this.socket
    this.socket = undefined
    this.connecting = false
    socket?.close(1000, 'assistant interrupted')
    this.running = false
    this.persist()
    this.emit('已中止')
  }

  destroy(): void {
    this.destroyed = true
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer)
    this.socket?.close(1000, 'assistant destroyed')
    this.socket = undefined
  }

  private connect(): void {
    if (this.destroyed || this.connecting || this.socket?.readyState === WebSocket.CONNECTING) return
    this.connecting = true
    const version = ++this.connectionVersion
    this.debug('connection', '开始建立 WebSocket 连接', { attempt: this.reconnectAttempts + 1 })
    let token: string | undefined | Promise<string | undefined>
    try {
      token = this.options.getAccessToken?.()
    } catch (error) {
      this.connecting = false
      this.emitAuthenticationFailure(error)
      return
    }
    if (token instanceof Promise) {
      void token.then(value => {
        if (version === this.connectionVersion) this.openSocket(value, version)
      }).catch(error => {
        if (version !== this.connectionVersion) return
        this.connecting = false
        this.emitAuthenticationFailure(error)
      })
      return
    }
    this.openSocket(token, version)
  }

  private openSocket(accessToken: string | undefined, version: number): void {
    if (version !== this.connectionVersion) return
    this.connecting = false
    if (this.destroyed) return
    if (this.options.authenticationRequired && !accessToken) {
      this.emitAuthenticationFailure(new Error('请先登录 Forge 账号'))
      return
    }
    const factory = this.options.webSocketFactory ?? (url => new WebSocket(url))
    const socket = factory(resolveWebSocketUrl(this.options.wsUrl, accessToken))
    this.socket = socket
    socket.addEventListener('open', () => this.onOpen(socket))
    socket.addEventListener('message', event => this.onMessage(event.data))
    socket.addEventListener('close', () => this.onClose(socket))
    socket.addEventListener('error', () => {
      this.debug('error', 'WebSocket 连接失败')
      this.emit('助手暂不可用', 'WebSocket 连接失败')
    })
  }

  private onOpen(socket: WebSocket): void {
    if (socket !== this.socket) return
    this.reconnectAttempts = 0
    this.debug('connection', 'WebSocket 连接成功', { restoringSession: Boolean(this.sessionId) })
    if (this.sessionId) {
      this.send({ type: 'attach', sessionId: this.sessionId, lastEventSeq: this.lastSeq })
    } else {
      this.send({
        type: 'open', cwd: this.options.workspace ?? '.', mode: 'plan',
        engine: this.options.engine ?? 'codex', consultEvidenceSystems: [],
      })
    }
  }

  private onClose(socket: WebSocket): void {
    if (socket !== this.socket) return
    this.socket = undefined
    if (this.destroyed) return
    this.debug('connection', 'WebSocket 连接关闭，准备重连')
    this.emit('正在重连')
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts)
    this.reconnectAttempts += 1
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== 'string') return
    let message: IncomingMessage
    try {
      message = JSON.parse(raw) as IncomingMessage
    } catch {
      this.debug('error', '收到无法解析的 WebSocket 消息')
      this.emit('协议异常', '服务端返回了无法解析的消息')
      return
    }
    this.debug('receive', '收到服务端消息', { type: message.type, seq: message.seq ?? 0 })
    if (!this.acceptSequence(message)) return
    this.applyMessage(message)
    this.persist()
  }

  private acceptSequence(message: IncomingMessage): boolean {
    if (message.type === 'ready' && message.epoch && this.epoch && message.epoch !== this.epoch) {
      this.lastSeq = 0
    }
    if (message.type === 'ready' && message.epoch) this.epoch = message.epoch
    const seq = typeof message.seq === 'number' ? message.seq : 0
    if (seq > 0 && seq <= this.lastSeq) return false
    if (seq > 0) this.lastSeq = seq
    return true
  }

  private applyMessage(message: IncomingMessage): void {
    switch (message.type) {
      case 'ready':
        this.sessionId = message.sessionId
        this.running = message.status?.toUpperCase() === 'RUNNING'
        this.emit(this.running ? '回复中' : '已就绪')
        this.resendAwaitingQueueAck()
        this.flushPendingCommands()
        this.flushPending()
        break
      case 'assistantDelta':
        this.running = true
        this.appendAssistantDelta(message.text ?? '')
        this.emit('回复中')
        break
      case 'result':
        this.running = false
        if (message.stopReason === 'interrupted') this.backgroundTaskCount = 0
        this.emit(message.stopReason === 'interrupted'
          ? '已中止'
          : this.backgroundTaskCount > 0 ? '后台处理中' : '已完成')
        this.flushPending()
        break
      case 'backgroundTasks':
        this.backgroundTaskCount = message.tasks?.length ?? 0
        this.emit(this.backgroundTaskCount > 0 ? '后台处理中' : (this.running ? '回复中' : '已完成'))
        break
      case 'queueAccepted':
        if (message.messageId) this.awaitingQueueAck.delete(message.messageId)
        this.queueSize = message.queueSize ?? this.queueSize
        this.emit(this.running ? '回复中' : '消息待发送')
        break
      case 'assistantCommandResult':
        this.applyAssistantCommandResult(message)
        break
      case 'queueDispatched':
        this.queueSize = Math.max(0, this.queueSize - 1)
        this.running = true
        this.ensureQueuedUserMessage(message)
        this.emit('回复中')
        break
      case 'error':
        if (message.code === 'TURN_BUSY' && this.pending.length > 0) {
          this.flushPendingAsQueue()
          break
        }
        if (message.terminal !== false) this.running = false
        this.emit('助手暂不可用', message.message ?? message.code ?? '未知错误')
        break
      case 'replayGap':
        this.emit('部分消息待同步', '断线时间较长，历史消息可能不完整')
        break
    }
  }

  private flushPending(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.sessionId || this.pending.length === 0) return
    if (this.running || this.backgroundTaskCount > 0) {
      this.flushPendingAsQueue()
      return
    }
    const first = this.pending.shift()
    if (!first) return
    this.sendSubmission(first)
    this.running = true
    if (this.pending.length > 0) this.flushPendingAsQueue()
    this.emit('回复中')
  }

  private flushPendingAsQueue(): void {
    const queued = this.pending.splice(0)
    queued.forEach(item => {
      this.sendQueuedSubmission(item)
      this.awaitingQueueAck.set(item.id, item)
    })
    this.queueSize += queued.length
    this.persist()
    if (queued.length > 0) this.emit(this.running ? '回复中' : '消息待发送')
  }

  private sendSubmission(item: PendingSubmission): void {
    const { submission } = item
    this.sendContextSave(item)
    this.send({
      type: 'send', text: submission.text,
      developerInstructions: buildAssistantDeveloperInstructions(submission.mode, submission.snapshot),
      assistant: {
        protocolVersion: submission.snapshot.protocolVersion,
        mode: submission.mode,
        contextSnapshot: submission.snapshot,
      },
    })
  }

  private sendQueuedSubmission(item: PendingSubmission): void {
    const developerInstructions = buildAssistantDeveloperInstructions(
      item.submission.mode, item.submission.snapshot,
    )
    this.sendContextSave(item)
    this.send({
      type: 'queue', id: item.id, text: item.submission.text,
      displayText: item.submission.text, developerInstructions, createdAt: item.createdAt,
    })
  }

  private resendAwaitingQueueAck(): void {
    this.awaitingQueueAck.forEach(item => this.sendQueuedSubmission(item))
  }

  private sendContextSave(item: PendingSubmission): void {
    if (!this.sessionId) return
    this.send({
      type: 'assistantContextSave', requestId: createId(), sessionId: this.sessionId,
      protocolVersion: item.submission.snapshot.protocolVersion,
      contextSnapshot: item.submission.snapshot,
    })
  }

  private applyAssistantCommandResult(message: IncomingMessage): void {
    const action = message.action
    if (!message.success) {
      this.emit(`${commandLabel(action)}失败`, message.message ?? message.errorCode ?? '命令执行失败')
      return
    }
    const data = message.data
    if (action === 'draftCreate' && isRecord(data) && typeof data.draftId === 'string') {
      this.draftId = data.draftId
      this.emit('等待确认', '草稿已保存，确认后才会登记正式需求')
      return
    }
    if (action === 'draftConfirm' && isRecord(data)) {
      this.emit('已保存', data.alreadySaved ? '该草稿已经保存' : '已登记为待执行需求')
      return
    }
    if (action === 'usersList' && Array.isArray(data)) {
      const users = data.filter(isRecord).map(item => ({
        userId: Number(item.userId),
        username: typeof item.username === 'string' ? item.username : undefined,
        displayName: typeof item.displayName === 'string' ? item.displayName : undefined,
      })).filter(item => Number.isFinite(item.userId))
      this.listener({ users })
    }
  }

  private ensureConnected(operation: () => void): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      operation()
      return
    }
    this.pendingCommands.push(operation)
    this.emit('正在连接', '连接稳定后可继续操作')
    this.connect()
  }

  private flushPendingCommands(): void {
    const commands = this.pendingCommands.splice(0)
    commands.forEach(command => command())
  }

  private send(value: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.debug('send', '发送 WebSocket 消息', safeProtocolMetadata(value))
    this.socket.send(JSON.stringify(value))
  }

  private debug(
    category: import('./types').AssistantDebugEntry['category'],
    summary: string,
    detail?: import('./types').AssistantDebugEntry['detail'],
  ): void {
    this.listener({ debugEntry: createAssistantDebugEntry(category, summary, detail) })
  }

  private appendAssistantDelta(text: string): void {
    if (!text) return
    const last = this.messages[this.messages.length - 1]
    if (last?.role === 'assistant' && last.streaming) {
      last.content += text
      return
    }
    this.messages.push({ id: `assistant-${createId()}`, role: 'assistant', content: text, streaming: true })
  }

  private ensureQueuedUserMessage(message: IncomingMessage): void {
    if (!message.messageId) return
    const id = `user-${message.messageId}`
    if (this.messages.some(item => item.id === id)) return
    this.messages.push({
      id, role: 'user', content: message.displayText ?? message.text ?? '', timestamp: message.createdAt,
    })
  }

  private emitAuthenticationFailure(error: unknown): void {
    this.emit('认证失败', error instanceof Error ? error.message : String(error), true)
  }

  private emit(state: string, message?: string, authenticationRequired = false): void {
    if (!this.running) {
      this.messages.forEach(item => {
        if (item.role === 'assistant') item.streaming = false
      })
    }
    this.listener({
      state, message, queueSize: this.queueSize, draftId: this.draftId,
      messages: this.messages.map(item => ({ ...item })),
      authenticationRequired,
    })
  }

  private restore(): void {
    const storage = this.options.storage ?? safeLocalStorage()
    if (!storage) return
    try {
      const raw = storage.getItem(this.storageKey)
      if (!raw) return
      const persisted = JSON.parse(raw) as PersistedConversation
      this.sessionId = persisted.sessionId
      this.lastSeq = persisted.lastSeq || 0
      this.epoch = persisted.epoch
      this.messages = Array.isArray(persisted.messages) ? persisted.messages : []
      this.pending = Array.isArray(persisted.pending) ? persisted.pending : []
      this.awaitingQueueAck = new Map((persisted.awaitingQueueAck ?? []).map(item => [item.id, item]))
      this.draftId = persisted.draftId
      this.idempotencyKeys = persisted.idempotencyKeys ?? {}
    } catch {
      storage.removeItem(this.storageKey)
    }
  }

  private persist(): void {
    const storage = this.options.storage ?? safeLocalStorage()
    if (!storage) return
    try {
      storage.setItem(this.storageKey, JSON.stringify({
        sessionId: this.sessionId, lastSeq: this.lastSeq, epoch: this.epoch, messages: this.messages,
        pending: this.pending, awaitingQueueAck: [...this.awaitingQueueAck.values()],
        draftId: this.draftId, idempotencyKeys: this.idempotencyKeys,
      } satisfies PersistedConversation))
    } catch {
      // 浏览器禁用或配额耗尽时，会话仍可在当前页面继续。
    }
  }
}

function safeProtocolMetadata(value: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  const type = typeof value.type === 'string' ? value.type : 'unknown'
  const detail: Record<string, string | number | boolean | undefined> = { type }
  if (typeof value.lastEventSeq === 'number') detail.lastEventSeq = value.lastEventSeq
  if (typeof value.protocolVersion === 'string') detail.protocolVersion = value.protocolVersion
  if (typeof value.kind === 'string') detail.kind = value.kind
  return detail
}

function resolveWebSocketUrl(value: string, accessToken?: string): string {
  const url = new URL(value, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (accessToken) url.searchParams.set('access_token', accessToken)
  return url.toString()
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function createId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `message-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function commandLabel(action?: string): string {
  switch (action) {
    case 'draftCreate': return '草稿保存'
    case 'draftConfirm': return '需求登记'
    case 'usersList': return '工程师列表加载'
    case 'contextSave': return '上下文保存'
    case 'intentRoute': return '意图识别'
    default: return '助手命令'
  }
}
