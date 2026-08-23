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

export interface AssistantWidgetMountOptions {
  visibility?: AssistantVisibilityOptions
  draggable?: boolean
  positionStorageKey?: string
  authentication?: AssistantWidgetAuthentication
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
  /** 内部试用模式：使用 Forge 账号跨域登录，只在 SDK 实例内存中保存 ACCESS token。 */
  externalLogin?: AssistantExternalLoginOptions
  /** 服务端咨询会话工作目录；外部宿主通常保持默认值。 */
  workspace?: string
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
  debugEntry?: AssistantDebugEntry
}

export interface AssistantTransport {
  start: (listener: (state: AssistantWidgetState) => void) => void
  submit: (submission: AssistantSubmission) => void
  saveDraft?: (submission: AssistantDraftSubmission) => void
  confirmDraft?: (draftId: string, engineerUserId?: number) => void
  listUsers?: () => void
  interrupt?: () => void
  destroy: () => void
}
