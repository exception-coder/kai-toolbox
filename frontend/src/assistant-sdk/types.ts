export const ASSISTANT_PROTOCOL_VERSION = '1.0' as const

export type AssistantMode = 'AUTO' | 'QUESTION' | 'BUG' | 'SUGGESTION' | 'DIAGNOSE'

export interface AssistantUserContext {
  id: string
  displayName?: string
  roles?: string[]
}

export interface AssistantPageContext {
  url: string
  title?: string
  routeName?: string
}

export interface AssistantBusinessObjectContext {
  type: string
  id: string
  attributes?: Record<string, unknown>
}

export interface AssistantContextContribution {
  key: string
  value: unknown
}

export interface AssistantContextProvider {
  id: string
  collect: (signal: AbortSignal) => Promise<AssistantContextContribution | undefined>
}

export interface AssistantShortcut {
  key?: string
  ctrlOrMeta?: boolean
  shift?: boolean
  alt?: boolean
}

export interface AssistantVisibilityOptions {
  /** 首次加载时隐藏入口；宿主主动 open 仍可直接显示。 */
  initiallyHidden?: boolean
  /** 仅用于本地显示门禁，不参与服务端认证。 */
  activationKey?: string
  /** 缺省为 Ctrl/Command + Alt/Option + Shift + 0。 */
  shortcut?: AssistantShortcut
}

export interface AssistantExternalLoginOptions {
  /** Forge 外部登录接口，例如 https://forge.example.com/api/auth/external-login。 */
  loginUrl: string
}

export interface AssistantWidgetAuthentication {
  authenticated: boolean
  login: (username: string, password: string) => Promise<void>
}

export type AssistantFeedbackCategory = 'BUG' | 'OPTIMIZATION' | 'REQUIREMENT'

export interface AssistantFeedbackCounts {
  bug: number
  optimization: number
  requirement: number
}

export interface AssistantFeedbackSession {
  id: string
  title: string
  lastSeenAt: number
  counts: AssistantFeedbackCounts
}

export interface AssistantFeedbackAttachment {
  id: string
  name: string
  mime: string
  size: number
}

export interface AssistantFeedbackRevision {
  revisionNo: number
  source: 'AI' | 'USER'
  category: AssistantFeedbackCategory
  requirementType: string
  content: string
  createdAt: number
}

export interface AssistantFeedbackCandidate {
  id: string
  sessionId: string
  category: AssistantFeedbackCategory
  requirementType: string
  sourceContent?: string
  aiOptimizedContent: string
  userRewrittenContent?: string
  content: string
  confidence: number
  reason: string
  pageUrl: string
  pageTitle: string
  detectedAt: number
  updateTime: number
  revisionNo: number
  aiOriginal?: AssistantFeedbackRevision
  attachments: AssistantFeedbackAttachment[]
}

export interface AssistantFeedbackArchiveClient {
  listSessions: () => Promise<{ items: AssistantFeedbackSession[]; nextCursor?: string }>
  listCandidates: (sessionId: string, category: AssistantFeedbackCategory) =>
    Promise<{ items: AssistantFeedbackCandidate[]; nextCursor?: string }>
  listRevisions: (sessionId: string, candidateId: string) =>
    Promise<{ items: AssistantFeedbackRevision[]; nextCursor?: string }>
  updateCandidate: (sessionId: string, candidate: AssistantFeedbackCandidate,
    update: Pick<AssistantFeedbackCandidate, 'category' | 'requirementType' | 'content'>) =>
    Promise<AssistantFeedbackCandidate>
  loadAttachment: (sessionId: string, candidateId: string, attachmentId: string) => Promise<Blob>
}

export interface AssistantWidgetMountOptions {
  visibility?: AssistantVisibilityOptions
  draggable?: boolean
  positionStorageKey?: string
  authentication?: AssistantWidgetAuthentication
  feedbackArchive?: AssistantFeedbackArchiveClient
  conversationHistory?: AssistantConversationHistoryClient
}

export interface AssistantConversationHistoryClient {
  loadEarlier: () => void
}

export interface AssistantInitOptions {
  appId: string
  appName?: string
  /** 宿主发布版本或上下文结构版本；变化时使旧模块探索摘要失效。 */
  sourceRevision?: string
  /** 统一 Assistant WebSocket 地址；配置后 SDK 不再需要宿主 React Bridge。 */
  wsUrl?: string
  /** 获取短期 Assistant ACCESS token；仅在建立 WS 时调用，不写入本地存储。 */
  getAccessToken?: () => string | undefined | Promise<string | undefined>
  /** 内部试用模式：使用 Forge 账号跨域登录，ACCESS token 仅保存到当前标签页会话。 */
  externalLogin?: AssistantExternalLoginOptions
  /** 服务端咨询会话工作目录；外部宿主通常保持默认值。 */
  workspace?: string
  /** Forge 受控项目键；外部宿主缺省使用 appId，由服务端解析为源码根。 */
  projectKey?: string
  /** 默认执行引擎。 */
  engine?: 'codex' | 'claude'
  user?: AssistantUserContext
  page?: AssistantPageContext
  businessObject?: AssistantBusinessObjectContext
  providers?: AssistantContextProvider[]
  providerTimeoutMs?: number
  additionalSensitiveFields?: string[]
  visibility?: AssistantVisibilityOptions
  /** 是否允许移动胶囊及桌面端对话框，缺省为 true；窄屏对话框始终固定。 */
  draggable?: boolean
  mountWidget?: (root: HTMLElement, options: AssistantWidgetMountOptions) => void | (() => void)
  transport?: AssistantTransport
}

export interface AssistantContextSnapshot {
  protocolVersion: typeof ASSISTANT_PROTOCOL_VERSION
  application: { appId: string; name?: string; sourceRevision?: string }
  user?: AssistantUserContext
  page?: AssistantPageContext
  businessObject?: AssistantBusinessObjectContext
  contributions: Record<string, unknown>
  unavailableProviders: string[]
  capturedAt: number
}

export interface AssistantSdk {
  open: (mode?: AssistantMode) => void
  close: () => void
  updateContext: (context: Pick<AssistantInitOptions, 'user' | 'page' | 'businessObject'>) => void
  registerProvider: (provider: AssistantContextProvider) => () => void
  snapshot: () => Promise<AssistantContextSnapshot>
  interrupt: () => void
  destroy: () => void
}

export interface AssistantSubmission {
  mode: AssistantMode
  text: string
  snapshot: AssistantContextSnapshot
  attachments?: AssistantImageAttachment[]
}

/** 仅存在当前页面内存的待上传图片，禁止持久化或写入日志。 */
export interface AssistantImageAttachment {
  id: string
  name: string
  mime: string
  size: number
  file: File
}

export interface AssistantUploadedAttachment {
  id: string
  name: string
  path: string
  mime: string
}

export interface AssistantDraftSubmission {
  kind: 'BUG' | 'SUGGESTION'
  title: string
  description: string
  snapshot: AssistantContextSnapshot
}

export interface AssistantConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  streaming?: boolean
}

export interface AssistantDebugEntry {
  id: string
  timestamp: number
  category: 'context' | 'connection' | 'send' | 'receive' | 'control' | 'error'
  summary: string
  detail?: Record<string, string | number | boolean | undefined>
}

export interface AssistantWidgetUser {
  userId: number
  displayName?: string
  username?: string
}

export interface AssistantWidgetState {
  state?: string
  message?: string
  queueSize?: number
  draftId?: string
  users?: AssistantWidgetUser[]
  messages?: AssistantConversationMessage[]
  authenticationRequired?: boolean
  submissionAccepted?: boolean
  failedSubmission?: AssistantSubmission
  debugEntry?: AssistantDebugEntry
  detectedIntent?: 'BUG' | 'SUGGESTION'
  detectionConfidence?: number
  historyLoading?: boolean
  historyExhausted?: boolean
  historyError?: string
  transcriptMissing?: boolean
}

export interface AssistantTransport {
  start: (listener: (state: AssistantWidgetState) => void) => void
  submit: (submission: AssistantSubmission) => void
  saveDraft?: (submission: AssistantDraftSubmission) => void
  confirmDraft?: (draftId: string, engineerUserId?: number) => void
  listUsers?: () => void
  updateContext?: (context: Pick<AssistantInitOptions, 'user' | 'page' | 'businessObject'>) => void
  loadEarlier?: () => void
  interrupt?: () => void
  destroy: () => void
}
