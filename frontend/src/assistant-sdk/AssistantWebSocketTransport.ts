import { buildAssistantDeveloperInstructions } from './prompt'
import type {
  AssistantConversationMessage,
  AssistantContextSnapshot,
  AssistantDraftSubmission,
  AssistantSubmission,
  AssistantTransport,
  AssistantUploadedAttachment,
  AssistantFeedbackArchiveClient,
  AssistantFeedbackCandidate,
  AssistantFeedbackCategory,
  AssistantInitOptions,
  AssistantPageContext,
  AssistantWidgetState,
} from './types'
import { createAssistantDebugEntry } from './assistantDebugLog'
import {
  compressModuleContextSummary,
  MODULE_CONTEXT_CONTRIBUTION_KEY,
  resolveModuleIdentity,
  type AssistantModuleIdentity,
} from './moduleContext'
import {
  assistantPageStorageSuffix,
  resolveAssistantPageIdentity,
  type AssistantPageIdentity,
} from './assistantPageIdentity'

const MAX_RECONNECT_DELAY_MS = 30_000
const BASE_RECONNECT_DELAY_MS = 500
const MODULE_CONTEXT_RESOLVE_TIMEOUT_MS = 2_000

export interface AssistantWebSocketTransportOptions {
  appId: string
  userId?: string
  wsUrl: string
  getAccessToken?: () => string | undefined | Promise<string | undefined>
  authenticationRequired?: boolean
  workspace?: string
  projectKey?: string
  engine?: 'codex' | 'claude'
  page?: AssistantPageContext
  webSocketFactory?: (url: string) => WebSocket
  fetcher?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

interface PendingSubmission {
  id: string
  submission: AssistantSubmission
  createdAt: number
  uploadedAttachments?: AssistantUploadedAttachment[]
}

interface PersistedConversation {
  projectKey?: string
  pageKey?: string
  sessionId?: string
  lastSeq: number
  epoch?: string
  messages?: AssistantConversationMessage[]
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
  attachments?: AssistantUploadedAttachment[]
  tasks?: unknown[]
  action?: string
  success?: boolean
  data?: unknown
  errorCode?: string
  requestId?: string
}

interface ConversationHistoryPage {
  items: AssistantConversationMessage[]
  nextBefore?: number | null
  transcriptMissing: boolean
}

interface ModuleContextState {
  status: 'loading' | 'hit' | 'miss'
  summary?: string
  sourceRevision?: string
  updatedAt?: number
  expiresAt?: number
}

/** 框架无关的 Assistant WS 客户端，负责会话、水位、重连和持久排队。 */
export class AssistantWebSocketTransport implements AssistantTransport, AssistantFeedbackArchiveClient {
  private readonly options: AssistantWebSocketTransportOptions
  private storageKey: string
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
  private conversationAnalysisInFlight = false
  private idempotencyKeys: Record<string, string> = {}
  private pendingCommands: Array<() => void> = []
  private connecting = false
  private connectionVersion = 0
  private moduleContexts = new Map<string, ModuleContextState>()
  private moduleContextRequests = new Map<string, AssistantModuleIdentity>()
  private moduleContextRequestTimers = new Map<string, number>()
  private activeModuleExploration?: AssistantModuleIdentity
  private uploadingSubmissionId?: string
  private pageIdentity?: AssistantPageIdentity
  private queuedPageContext?: AssistantPageContext
  private historyBefore?: number | null
  private historySessionId?: string
  private historyLoading = false
  private historyExhausted = false
  private historyError?: string
  private transcriptMissing = false
  private started = false

  constructor(options: AssistantWebSocketTransportOptions) {
    this.options = options
    this.pageIdentity = resolveAssistantPageIdentity(options.appId, options.page)
    this.storageKey = this.resolveStorageKey()
    this.restore()
  }

  start(listener: (state: AssistantWidgetState) => void): void {
    this.started = true
    this.listener = listener
    this.debug('connection', 'Transport 已初始化')
    this.emit(this.messages.length > 0 ? '已恢复' : '已就绪')
    if (this.pageIdentity) this.connect()
  }

  updateContext(context: Pick<AssistantInitOptions, 'user' | 'page' | 'businessObject'>): void {
    if (!Object.hasOwn(context, 'page')) return
    const page = context.page
    if (this.running || this.pending.length > 0 || this.awaitingQueueAck.size > 0) {
      this.queuedPageContext = page
      return
    }
    this.switchPage(page)
  }

  loadEarlier(): void {
    if (!this.sessionId || this.historyLoading || this.historyExhausted) return
    void this.loadHistory(false)
  }

  async loadConversationAttachment(attachmentId: string): Promise<Blob> {
    if (!this.sessionId) throw new Error('会话尚未建立，无法读取附件')
    const response = await this.apiFetch(
      `/api/assistant/conversations/${encodeURIComponent(this.sessionId)}`
      + `/attachments/${encodeURIComponent(attachmentId)}`)
    return response.blob()
  }

  async listSessions() {
    if (!this.sessionId) return { items: [] }
    const params = new URLSearchParams({ sessionId: this.sessionId })
    return this.apiJson<{ items: import('./types').AssistantFeedbackSession[]; nextCursor?: string }>(
      `/api/assistant/feedback-sessions?${params.toString()}`)
  }

  async listCandidates(sessionId: string, category: AssistantFeedbackCategory) {
    return this.apiJson<{ items: AssistantFeedbackCandidate[]; nextCursor?: string }>(
      `/api/assistant/feedback-sessions/${encodeURIComponent(sessionId)}/candidates?category=${category}`)
  }

  async listRevisions(sessionId: string, candidateId: string) {
    return this.apiJson<{ items: import('./types').AssistantFeedbackRevision[]; nextCursor?: string }>(
      `/api/assistant/feedback-sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}/revisions`)
  }

  async updateCandidate(sessionId: string, candidate: AssistantFeedbackCandidate,
    update: Pick<AssistantFeedbackCandidate, 'category' | 'requirementType' | 'content'>) {
    return this.apiJson<AssistantFeedbackCandidate>(
      `/api/assistant/feedback-sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidate.id)}`,
      { method: 'PATCH', body: JSON.stringify({ ...update, expectedUpdateTime: candidate.updateTime }) },
    )
  }

  async loadAttachment(sessionId: string, candidateId: string, attachmentId: string): Promise<Blob> {
    const response = await this.apiFetch(
      `/api/assistant/feedback-sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}`
      + `/attachments/${encodeURIComponent(attachmentId)}`)
    return response.blob()
  }

  private async apiJson<T>(path: string, init?: RequestInit): Promise<T> {
    return (await this.apiFetch(path, init)).json() as Promise<T>
  }

  private async apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.options.getAccessToken?.()
    if (this.options.authenticationRequired && !token) {
      throw new AssistantUploadAuthenticationError('Forge 登录已失效，请重新登录')
    }
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (init.body) headers.set('Content-Type', 'application/json')
    const response = await (this.options.fetcher ?? fetch)(resolveAssistantApiUrl(this.options.wsUrl, path), {
      ...init, headers,
    })
    if (!response.ok) throw new Error(await assistantApiError(response))
    return response
  }

  resumeAfterAuthentication(): void {
    if (this.destroyed) return
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.reconnectAttempts = 0
    this.connectionVersion += 1
    const socket = this.socket
    this.socket = undefined
    this.connecting = false
    socket?.close(1000, 'assistant authentication refreshed')
    this.connect()
  }

  submit(submission: AssistantSubmission): void {
    const submissionIdentity = resolveAssistantPageIdentity(this.options.appId, submission.snapshot.page)
    if (submissionIdentity && submissionIdentity.pageKey !== this.pageIdentity?.pageKey
        && !this.running && this.pending.length === 0 && this.awaitingQueueAck.size === 0) {
      this.switchPage(submission.snapshot.page)
    }
    const pending = { id: createId(), submission, createdAt: Date.now() }
    this.pending.push(pending)
    this.messages.push({
      id: `user-${pending.id}`,
      role: 'user',
      content: submission.text || imageMessageLabel(submission.attachments?.length ?? 0),
      timestamp: pending.createdAt,
      attachments: submission.attachments?.map(attachment => ({ ...attachment })),
    })
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
    socket.addEventListener('message', event => {
      if (socket === this.socket) this.onMessage(event.data)
    })
    socket.addEventListener('close', () => this.onClose(socket))
    socket.addEventListener('error', () => {
      if (socket !== this.socket) return
      this.debug('error', 'WebSocket 连接失败')
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
        projectKey: this.options.projectKey,
        engine: this.options.engine ?? 'codex', consultEvidenceSystems: [],
        assistantAppId: this.pageIdentity?.appId,
        assistantPageKey: this.pageIdentity?.pageKey,
        assistantPageUrl: this.pageIdentity?.pageUrl,
      })
    }
  }

  private onClose(socket: WebSocket): void {
    if (socket !== this.socket) return
    this.socket = undefined
    this.conversationAnalysisInFlight = false
    this.resetLoadingModuleContexts()
    if (this.destroyed) return
    this.debug('connection', 'WebSocket 连接关闭，准备重连')
    this.emit(this.pageIdentity && !this.sessionId ? '正在载入页面会话' : '正在重连')
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
        this.resendAwaitingQueueAck()
        this.flushPendingCommands()
        if (this.pageIdentity && this.sessionId && this.historySessionId !== this.sessionId) {
          this.completeReady()
          void this.loadHistory(true)
          break
        }
        this.completeReady()
        break
      case 'assistantDelta':
        this.running = true
        this.appendAssistantDelta(message.text ?? '')
        this.emit('回复中')
        break
      case 'result':
        this.running = false
        if (message.stopReason === 'interrupted') this.activeModuleExploration = undefined
        else this.saveActiveModuleExploration()
        if (message.stopReason === 'interrupted') this.backgroundTaskCount = 0
        if (message.stopReason !== 'interrupted') this.requestConversationAnalysis()
        this.emit(message.stopReason === 'interrupted'
          ? '已中止'
          : this.backgroundTaskCount > 0 ? '后台处理中' : '已完成')
        this.flushPending()
        this.applyQueuedPageContext()
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
        if (message.terminal !== false) {
          this.running = false
          this.activeModuleExploration = undefined
        }
        this.emit('助手暂不可用', message.message ?? message.code ?? '未知错误')
        break
      case 'replayGap':
        this.emit('部分消息待同步', '断线时间较长，历史消息可能不完整')
        break
    }
  }

  private completeReady(): void {
    this.flushPending()
    if (!this.running && this.messages.length > 0) this.requestConversationAnalysis()
    this.emit(this.running ? '回复中' : '已就绪')
  }

  private async loadHistory(reset: boolean): Promise<void> {
    const sessionId = this.sessionId
    if (!sessionId || this.historyLoading) return
    const requestedBefore = reset ? undefined : this.historyBefore
    this.historyLoading = true
    this.historyError = undefined
    if (reset) {
      this.historyBefore = undefined
      this.historyExhausted = false
      this.transcriptMissing = false
    }
    this.emit(reset ? '正在载入近期消息' : (this.running ? '回复中' : '正在载入更早消息'))
    try {
      const params = new URLSearchParams({ limit: '30' })
      if (!reset && this.historyBefore != null) params.set('before', String(this.historyBefore))
      const page = await this.apiJson<ConversationHistoryPage>(
        `/api/assistant/conversations/${encodeURIComponent(sessionId)}/messages?${params.toString()}`)
      if (sessionId !== this.sessionId) return
      this.messages = mergeConversationMessages(page.items, this.messages, reset)
      this.historyBefore = page.nextBefore
      this.historyExhausted = page.nextBefore == null
        || page.nextBefore <= 0
        || (requestedBefore != null && page.nextBefore === requestedBefore)
      this.transcriptMissing = page.transcriptMissing
      this.historySessionId = sessionId
      this.historyError = undefined
    } catch (error) {
      if (sessionId !== this.sessionId) return
      this.historyError = error instanceof Error ? error.message : '历史消息加载失败'
    } finally {
      if (sessionId === this.sessionId) {
        this.historyLoading = false
        this.emit(this.running ? '回复中' : '已就绪')
      }
    }
  }

  private switchPage(page?: AssistantPageContext): void {
    const identity = resolveAssistantPageIdentity(this.options.appId, page)
    if (identity?.pageKey === this.pageIdentity?.pageKey) return
    this.persist()
    this.pageIdentity = identity
    this.storageKey = this.resolveStorageKey()
    this.sessionId = undefined
    this.lastSeq = 0
    this.epoch = undefined
    this.messages = []
    this.pending = []
    this.awaitingQueueAck.clear()
    this.draftId = undefined
    this.idempotencyKeys = {}
    this.historyBefore = undefined
    this.historySessionId = undefined
    this.historyExhausted = false
    this.historyError = undefined
    this.transcriptMissing = false
    this.restore()
    this.connectionVersion += 1
    const socket = this.socket
    this.socket = undefined
    this.connecting = false
    socket?.close(1000, 'assistant page changed')
    this.emit('正在载入页面会话')
    if (this.started && identity) this.connect()
  }

  private applyQueuedPageContext(): void {
    if (!this.queuedPageContext || this.running || this.pending.length > 0 || this.awaitingQueueAck.size > 0) return
    const page = this.queuedPageContext
    this.queuedPageContext = undefined
    this.switchPage(page)
  }

  private resolveStorageKey(): string {
    const base = `kai-assistant:ws:${this.options.appId}:${this.options.userId ?? 'anonymous'}`
    return this.pageIdentity ? `${base}:${assistantPageStorageSuffix(this.pageIdentity)}` : base
  }

  private flushPending(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.sessionId || this.pending.length === 0) return
    const candidate = this.pending[0]
    if (!candidate || !this.prepareModuleContext(candidate)) return
    if (candidate.submission.attachments?.length && !candidate.uploadedAttachments) {
      if (this.uploadingSubmissionId === candidate.id) return
      this.uploadingSubmissionId = candidate.id
      this.emit('正在上传图片')
      void this.uploadSubmissionAttachments(candidate)
      return
    }
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
    const identity = resolveModuleIdentity(submission.snapshot)
    if (identity && this.moduleContexts.get(moduleContextMapKey(identity))?.status === 'miss') {
      this.activeModuleExploration = identity
    }
    this.sendContextSave(item)
    this.send({
      type: 'send', text: submission.text,
      attachments: item.uploadedAttachments,
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
      displayText: item.submission.text || imageMessageLabel(item.uploadedAttachments?.length ?? 0),
      developerInstructions, attachments: item.uploadedAttachments, createdAt: item.createdAt,
    })
  }

  private async uploadSubmissionAttachments(item: PendingSubmission): Promise<void> {
    try {
      if (!this.sessionId) throw new Error('会话尚未建立，无法上传图片')
      const token = await this.options.getAccessToken?.()
      if (this.options.authenticationRequired && !token) {
        throw new AssistantUploadAuthenticationError('Forge 登录已失效，请重新登录')
      }
      const fetcher = this.options.fetcher ?? fetch
      const uploaded: AssistantUploadedAttachment[] = []
      for (const attachment of item.submission.attachments ?? []) {
        const body = new FormData()
        body.append('file', attachment.file, attachment.name)
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const response = await fetcher(resolveAttachmentUploadUrl(this.options.wsUrl, this.sessionId), {
          method: 'POST', headers, body,
        })
        if (response.status === 401) throw new AssistantUploadAuthenticationError('Forge 登录已失效，请重新登录')
        if (!response.ok) throw new Error(await attachmentUploadError(response))
        uploaded.push(parseUploadedAttachment(await response.json()))
      }
      item.uploadedAttachments = uploaded
      this.uploadingSubmissionId = undefined
      this.persist()
      this.listener({ submissionAccepted: true })
      this.flushPending()
    } catch (error) {
      this.uploadingSubmissionId = undefined
      this.pending = this.pending.filter(pending => pending.id !== item.id)
      this.messages = this.messages.filter(message => message.id !== `user-${item.id}`)
      this.persist()
      const authenticationRequired = error instanceof AssistantUploadAuthenticationError
      this.listener({
        state: authenticationRequired ? '认证失败' : '图片上传失败',
        message: error instanceof Error ? error.message : '图片上传失败，请重试',
        messages: this.messages.map(message => ({ ...message })),
        failedSubmission: item.submission,
        authenticationRequired,
      })
    }
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
      if (action === 'moduleContextResolve') {
        this.completeModuleContextMiss(message.requestId)
        this.debug('context', '模块探索摘要读取失败，已降级为实时探索', { errorCode: message.errorCode })
        this.flushPending()
        return
      }
      if (action === 'moduleContextSave') {
        this.debug('context', '模块探索摘要保存失败，本次会话仍可继续', { errorCode: message.errorCode })
        return
      }
      if (action === 'conversationAnalysis') {
        this.conversationAnalysisInFlight = false
        this.debug('error', '会话反馈增量识别失败，保留原水位等待下次重试', {
          errorCode: message.errorCode,
        })
        return
      }
      this.emit(`${commandLabel(action)}失败`, message.message ?? message.errorCode ?? '命令执行失败')
      return
    }
    const data = message.data
    if (action === 'conversationAnalysis') {
      this.conversationAnalysisInFlight = false
      this.applyConversationAnalysis(data)
      return
    }
    if (action === 'moduleContextResolve') {
      this.completeModuleContextResolve(message.requestId, data)
      this.flushPending()
      return
    }
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

  private requestConversationAnalysis(): void {
    if (!this.sessionId || this.conversationAnalysisInFlight) return
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.conversationAnalysisInFlight = true
    this.send({
      type: 'assistantConversationAnalyze', requestId: createId(), sessionId: this.sessionId,
    })
  }

  private applyConversationAnalysis(data: unknown): void {
    if (!isRecord(data)) return
    if (Array.isArray(data.detections) && data.detections.some(detection =>
      isRecord(detection) && detection.feedbackCategory !== 'NONE')) {
      this.listener({ feedbackArchiveChanged: true })
    }
    if (data.caughtUp === false || data.stale === true) this.requestConversationAnalysis()
  }

  private prepareModuleContext(item: PendingSubmission): boolean {
    const identity = resolveModuleIdentity(item.submission.snapshot)
    if (!identity) return true
    const key = moduleContextMapKey(identity)
    const state = this.moduleContexts.get(key)
    if (state?.status === 'loading') return false
    if (state?.status === 'hit' && state.summary) {
      item.submission.snapshot = withModuleContext(item.submission.snapshot, state)
      return true
    }
    if (state?.status === 'miss') return true
    const requestId = createId()
    this.moduleContexts.set(key, { status: 'loading' })
    this.moduleContextRequests.set(requestId, identity)
    const timer = window.setTimeout(() => {
      this.completeModuleContextMiss(requestId)
      this.debug('context', '模块探索摘要读取超时，已降级为实时探索', { moduleKey: identity.moduleKey })
      this.flushPending()
    }, MODULE_CONTEXT_RESOLVE_TIMEOUT_MS)
    this.moduleContextRequestTimers.set(requestId, timer)
    this.send({ type: 'assistantModuleContextResolve', requestId, ...identity })
    this.debug('context', '正在读取模块探索摘要', { moduleKey: identity.moduleKey })
    return false
  }

  private completeModuleContextResolve(requestId: string | undefined, data: unknown): void {
    const identity = requestId ? this.moduleContextRequests.get(requestId) : undefined
    if (!identity) return
    this.clearModuleContextTimer(requestId!)
    this.moduleContextRequests.delete(requestId!)
    const key = moduleContextMapKey(identity)
    if (isRecord(data) && data.found === true && typeof data.summary === 'string' && data.summary.trim()) {
      this.moduleContexts.set(key, {
        status: 'hit', summary: data.summary,
        sourceRevision: typeof data.sourceRevision === 'string' ? data.sourceRevision : undefined,
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
        expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
      })
      this.debug('context', '已复用模块探索摘要', { moduleKey: identity.moduleKey })
      return
    }
    this.moduleContexts.set(key, { status: 'miss' })
    this.debug('context', '模块探索摘要未命中，将在本轮完成后回写', { moduleKey: identity.moduleKey })
  }

  private completeModuleContextMiss(requestId: string | undefined): void {
    const identity = requestId ? this.moduleContextRequests.get(requestId) : undefined
    if (!identity) return
    this.clearModuleContextTimer(requestId!)
    this.moduleContextRequests.delete(requestId!)
    this.moduleContexts.set(moduleContextMapKey(identity), { status: 'miss' })
  }

  private saveActiveModuleExploration(): void {
    const identity = this.activeModuleExploration
    this.activeModuleExploration = undefined
    if (!identity) return
    const answer = [...this.messages].reverse().find(message => message.role === 'assistant')?.content ?? ''
    const summary = compressModuleContextSummary(answer)
    if (!summary) return
    this.send({ type: 'assistantModuleContextSave', requestId: createId(), ...identity, summary })
    this.moduleContexts.set(moduleContextMapKey(identity), { status: 'hit', summary })
    this.debug('context', '模块探索摘要已压缩并回写', {
      moduleKey: identity.moduleKey, summaryLength: summary.length,
    })
  }

  private clearModuleContextTimer(requestId: string): void {
    const timer = this.moduleContextRequestTimers.get(requestId)
    if (timer !== undefined) window.clearTimeout(timer)
    this.moduleContextRequestTimers.delete(requestId)
  }

  private resetLoadingModuleContexts(): void {
    this.moduleContextRequestTimers.forEach(timer => window.clearTimeout(timer))
    this.moduleContextRequestTimers.clear()
    this.moduleContextRequests.clear()
    for (const [key, state] of this.moduleContexts) {
      if (state.status === 'loading') this.moduleContexts.delete(key)
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
      attachments: message.attachments?.map(attachment => ({
        id: attachment.id, name: attachment.name, mime: attachment.mime,
      })),
    })
  }

  private emitAuthenticationFailure(error: unknown): void {
    this.emit('认证失败', error instanceof Error ? error.message : String(error), true)
  }

  private emit(state: string, message?: string, authenticationRequired = false,
               detectedIntent?: 'BUG' | 'SUGGESTION', detectionConfidence?: number): void {
    if (!this.running) {
      this.messages.forEach(item => {
        if (item.role === 'assistant') item.streaming = false
      })
    }
    this.listener({
      state, message, queueSize: this.queueSize, draftId: this.draftId,
      messages: this.messages.map(item => ({ ...item })),
      historyLoading: this.historyLoading,
      historyExhausted: this.historyExhausted,
      historyError: this.historyError,
      transcriptMissing: this.transcriptMissing,
      authenticationRequired,
      detectedIntent,
      detectionConfidence,
    })
  }

  private restore(): void {
    const storage = this.options.storage ?? safeLocalStorage()
    if (!storage) return
    try {
      const raw = storage.getItem(this.storageKey)
      if (!raw) return
      const persisted = JSON.parse(raw) as PersistedConversation
      if (this.options.projectKey && persisted.projectKey !== this.options.projectKey) {
        storage.removeItem(this.storageKey)
        return
      }
      if (this.pageIdentity && persisted.pageKey !== this.pageIdentity.pageKey) {
        storage.removeItem(this.storageKey)
        return
      }
      this.sessionId = this.pageIdentity ? undefined : persisted.sessionId
      this.lastSeq = this.pageIdentity ? 0 : persisted.lastSeq || 0
      this.epoch = this.pageIdentity ? undefined : persisted.epoch
      this.messages = []
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
        projectKey: this.options.projectKey,
        pageKey: this.pageIdentity?.pageKey,
        sessionId: this.sessionId, lastSeq: this.lastSeq, epoch: this.epoch,
        pending: this.pending.map(toPersistedPending).filter(isPresent),
        awaitingQueueAck: [...this.awaitingQueueAck.values()].map(toPersistedPending).filter(isPresent),
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

function resolveAttachmentUploadUrl(wsUrl: string, sessionId: string): string {
  const url = new URL(wsUrl, window.location.href)
  url.protocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'https:' : 'http:'
  url.pathname = `/api/claude-chat/sessions/${encodeURIComponent(sessionId)}/attachments`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function resolveAssistantApiUrl(wsUrl: string, path: string): string {
  const url = new URL(wsUrl, window.location.href)
  url.protocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'https:' : 'http:'
  url.pathname = path
  url.search = path.includes('?') ? path.slice(path.indexOf('?')) : ''
  if (url.search) url.pathname = path.slice(0, path.indexOf('?'))
  url.hash = ''
  return url.toString()
}

async function assistantApiError(response: Response): Promise<string> {
  if (response.status === 401) return 'Forge 登录已失效，请重新登录'
  if (response.status === 409) return '该记录已被更新，请刷新后重试'
  try {
    const body = await response.json() as { message?: unknown; detail?: unknown }
    const message = typeof body.message === 'string' ? body.message : body.detail
    if (typeof message === 'string' && message.trim()) return message
  } catch { /* 使用稳定状态码提示。 */ }
  return `Assistant 请求失败（HTTP ${response.status}）`
}

async function attachmentUploadError(response: Response): Promise<string> {
  if (response.status === 413) return '图片过大，请压缩后重试'
  if (response.status === 415) return '图片格式不受支持'
  if (response.status === 403) return '当前账号不能向该会话上传图片'
  try {
    const body = await response.json() as { message?: unknown; detail?: unknown }
    const message = typeof body.message === 'string' ? body.message : body.detail
    if (typeof message === 'string' && message.trim()) return message
  } catch {
    // 非 JSON 错误响应使用稳定的用户提示。
  }
  return `图片上传失败（HTTP ${response.status}）`
}

function parseUploadedAttachment(value: unknown): AssistantUploadedAttachment {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string'
      || typeof value.path !== 'string' || typeof value.mime !== 'string') {
    throw new Error('图片上传响应格式无效')
  }
  return { id: value.id, name: value.name, path: value.path, mime: value.mime }
}

function toPersistedPending(item: PendingSubmission): PendingSubmission | undefined {
  if (item.submission.attachments?.length && !item.uploadedAttachments) return undefined
  return {
    ...item,
    submission: { ...item.submission, attachments: undefined },
    uploadedAttachments: item.uploadedAttachments ? [...item.uploadedAttachments] : undefined,
  }
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined
}

function mergeConversationMessages(
  history: AssistantConversationMessage[],
  current: AssistantConversationMessage[],
  _reset: boolean,
): AssistantConversationMessage[] {
  const merged = new Map<string, AssistantConversationMessage>()
  history.forEach(message => merged.set(message.id, { ...message, streaming: false }))
  current.forEach(message => merged.set(message.id, { ...message }))
  return [...merged.values()]
}

function imageMessageLabel(count: number): string {
  return count === 1 ? '[图片]' : `[${count} 张图片]`
}

class AssistantUploadAuthenticationError extends Error {}

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
    case 'conversationAnalysis': return '会话反馈识别'
    case 'moduleContextResolve': return '模块摘要读取'
    case 'moduleContextSave': return '模块摘要保存'
    default: return '助手命令'
  }
}

function moduleContextMapKey(identity: AssistantModuleIdentity): string {
  return `${identity.appId}\u0000${identity.moduleKey}\u0000${identity.sourceRevision}`
}

function withModuleContext(
  snapshot: AssistantContextSnapshot,
  state: ModuleContextState,
): AssistantContextSnapshot {
  return {
    ...snapshot,
    contributions: {
      ...snapshot.contributions,
      [MODULE_CONTEXT_CONTRIBUTION_KEY]: {
        summary: state.summary,
        sourceRevision: state.sourceRevision,
        updatedAt: state.updatedAt,
        expiresAt: state.expiresAt,
        trust: 'historical-clue',
      },
    },
  }
}
