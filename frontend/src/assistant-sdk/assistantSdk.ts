import { collectProviderContext } from './providerCollector'
import {
  ASSISTANT_PROTOCOL_VERSION,
  type AssistantContextSnapshot,
  type AssistantContextProvider,
  type AssistantInitOptions,
  type AssistantMode,
  type AssistantSdk,
} from './types'
import { mountAssistantWidget } from './widget'
import { sanitizeEvidence } from './sanitizer'
import { AssistantWebSocketTransport } from './AssistantWebSocketTransport'
import { AssistantExternalLoginClient } from './externalLogin'
import { createAssistantDebugEntry } from './assistantDebugLog'
import { currentAssistantPageContext, observeAssistantPageNavigation } from './assistantPageNavigation'
import { resolveAssistantConnectionOptions } from './requestBaseUrl'
import {
  readAssistantRequestBaseUrlPreference,
  writeAssistantRequestBaseUrlPreference,
} from './requestBaseUrlPreference'

const ROOT_ELEMENT_ID = 'kai-assistant-widget-root'

let singleton: AssistantSdk | undefined

export function initializeAssistant(options: AssistantInitOptions): AssistantSdk {
  if (singleton) return singleton

  const defaultConnection = resolveAssistantConnectionOptions(options)
  const userRequestBaseUrl = options.transport
    ? undefined
    : readAssistantRequestBaseUrlPreference(options.appId)
  const connection = resolveAssistantConnectionOptions(userRequestBaseUrl
    ? {
        ...options,
        requestBaseUrl: userRequestBaseUrl,
        wsUrl: undefined,
        externalLogin: options.externalLogin ? { ...options.externalLogin, loginUrl: undefined } : undefined,
      }
    : options)
  let currentContext = pickMutableContext(options)
  const trackPageUrl = options.trackPageUrl !== false
  if (trackPageUrl && !currentContext.page) currentContext.page = currentAssistantPageContext()
  const providers = new Map(options.providers?.map(provider => [provider.id, provider]) ?? [])
  const root = ensureRoot()
  const externalLogin = !options.transport && connection.wsUrl && !options.getAccessToken && connection.externalLogin
    ? new AssistantExternalLoginClient(connection.externalLogin)
    : undefined
  const webSocketTransport = !options.transport && connection.wsUrl ? new AssistantWebSocketTransport({
    appId: options.appId,
    userId: options.user?.id,
    wsUrl: connection.wsUrl,
    getAccessToken: options.getAccessToken ?? (() => externalLogin?.requireAccessToken()),
    authenticationRequired: Boolean(externalLogin),
    onAuthenticationInvalid: () => externalLogin?.clear(),
    workspace: options.workspace,
    projectKey: options.projectKey ?? options.appId,
    engine: options.engine,
    page: currentContext.page,
  }) : undefined
  const transport = options.transport ?? webSocketTransport
  const feedbackArchive = webSocketTransport ?? (isFeedbackArchiveClient(transport) ? transport : undefined)
  const authentication = externalLogin ? {
    authenticated: externalLogin.isAuthenticated(),
    login: async (username: string, password: string) => {
      const accessToken = await externalLogin.login(username, password)
      webSocketTransport?.resumeAfterAuthentication(accessToken)
    },
  } : undefined
  const unmountWidget = (options.mountWidget ?? mountAssistantWidget)(root, {
    visibility: options.visibility,
    draggable: options.draggable ?? true,
    positionStorageKey: `kai-assistant:position:${options.appId}:${options.user?.id ?? 'anonymous'}`,
    authentication,
    feedbackArchive,
    conversationHistory: transport?.loadEarlier
      ? {
          loadEarlier: () => transport.loadEarlier?.(),
          loadAttachment: transport.loadConversationAttachment
            ? attachmentId => transport.loadConversationAttachment!(attachmentId)
            : undefined,
        }
      : undefined,
    connectionSettings: !options.transport && defaultConnection.requestBaseUrl && connection.requestBaseUrl
      ? {
          effectiveRequestBaseUrl: connection.requestBaseUrl,
          defaultRequestBaseUrl: defaultConnection.requestBaseUrl,
          userRequestBaseUrl,
          apply: requestBaseUrl => {
            writeAssistantRequestBaseUrlPreference(options.appId, requestBaseUrl)
            window.location.reload()
          },
        }
      : undefined,
  })
  let opened = false
  let activePreparation: AbortController | undefined
  let stopPageNavigation: () => void = () => undefined

  const captureSnapshot = async (signal?: AbortSignal) => {
    const collected = await collectProviderContext([...providers.values()], options.providerTimeoutMs, signal)
    return sanitizeEvidence({
      protocolVersion: ASSISTANT_PROTOCOL_VERSION,
      application: { appId: options.appId, name: options.appName, sourceRevision: options.sourceRevision },
      ...currentContext,
      ...collected,
      capturedAt: Date.now(),
    }, { additionalSensitiveFields: options.additionalSensitiveFields }) as AssistantContextSnapshot
  }

  const sdk: AssistantSdk = {
    open: (mode: AssistantMode = 'AUTO') => {
      opened = true
      root.dataset.open = 'true'
      root.dataset.mode = mode
      root.dispatchEvent(new CustomEvent('kai-assistant-open', { detail: { mode } }))
    },
    close: () => {
      opened = false
      root.dataset.open = 'false'
      root.dispatchEvent(new CustomEvent('kai-assistant-close'))
    },
    updateContext: context => {
      currentContext = { ...currentContext, ...copyContext(context) }
      transport?.updateContext?.(context)
    },
    registerProvider: provider => {
      providers.set(provider.id, provider)
      return () => {
        if (providers.get(provider.id) === provider) providers.delete(provider.id)
      }
    },
    snapshot: () => captureSnapshot(),
    interrupt: () => {
      if (activePreparation) {
        activePreparation.abort('user-interrupted')
        activePreparation = undefined
        emitTransportState({
          state: '已中止',
          debugEntry: createAssistantDebugEntry('control', '用户中止了上下文准备'),
        })
        return
      }
      transport?.interrupt?.()
    },
    destroy: () => {
      if (singleton !== sdk) return
      if (opened) sdk.close()
      if (typeof unmountWidget === 'function') unmountWidget()
      root.removeEventListener('assistant-submit', submit)
      root.removeEventListener('assistant-save-draft', saveDraft)
      root.removeEventListener('assistant-confirm-draft', confirmDraft)
      root.removeEventListener('assistant-interrupt', interrupt)
      root.removeEventListener('assistant-hidden', hidden)
      activePreparation?.abort('assistant-destroyed')
      stopPageNavigation()
      transport?.destroy()
      root.remove()
      providers.clear()
      singleton = undefined
    },
  }

  singleton = sdk
  const emitTransportState = (detail: import('./types').AssistantWidgetState) => {
    root.dispatchEvent(new CustomEvent('kai-assistant-state', { detail }))
  }
  const submit = (event: Event) => {
    const detail = (event as CustomEvent<{
      mode: AssistantMode
      text: string
      attachments?: import('./types').AssistantImageAttachment[]
    }>).detail
    if (!transport) {
      emitTransportState({
        state: '配置缺失',
        message: '未配置 Assistant 请求域或 WebSocket 地址，请检查 requestBaseUrl / wsUrl',
        debugEntry: createAssistantDebugEntry('error', '缺少 WebSocket Transport', { appId: options.appId }),
      })
      return
    }
    const preparation = new AbortController()
    activePreparation = preparation
    emitTransportState({
      debugEntry: createAssistantDebugEntry('context', '开始采集页面上下文', {
        providerCount: providers.size, mode: detail.mode,
      }),
    })
    void captureSnapshot(preparation.signal).then(snapshot => {
      if (preparation.signal.aborted) return
      emitTransportState({
        debugEntry: createAssistantDebugEntry('context', '页面上下文采集完成', {
          contributionCount: Object.keys(snapshot.contributions).length,
          unavailableProviderCount: snapshot.unavailableProviders.length,
        }),
      })
      transport?.submit({ ...detail, snapshot })
    })
      .catch(error => emitTransportState({
        state: '准备失败', message: error instanceof Error ? error.message : String(error),
        debugEntry: createAssistantDebugEntry('error', '页面上下文准备失败'),
      }))
      .finally(() => {
        if (activePreparation === preparation) activePreparation = undefined
      })
  }
  const saveDraft = (event: Event) => {
    const detail = (event as CustomEvent<{
      kind: 'BUG' | 'SUGGESTION'; title: string; description: string
    }>).detail
    if (!transport?.saveDraft) {
      emitTransportState({ state: '草稿保存失败', message: '当前接入未配置草稿保存能力' })
      return
    }
    void sdk.snapshot().then(snapshot => transport.saveDraft?.({ ...detail, snapshot }))
      .catch(error => emitTransportState({
        state: '草稿保存失败', message: error instanceof Error ? error.message : String(error),
      }))
  }
  const confirmDraft = (event: Event) => {
    const detail = (event as CustomEvent<{ draftId: string; engineerUserId?: number }>).detail
    if (!transport?.confirmDraft) {
      emitTransportState({ state: '需求登记失败', message: '当前接入未配置需求登记能力' })
      return
    }
    transport.confirmDraft(detail.draftId, detail.engineerUserId)
  }
  const interrupt = () => sdk.interrupt()
  const hidden = () => {
    opened = false
    root.dataset.open = 'false'
  }
  root.addEventListener('assistant-hidden', hidden)
  root.addEventListener('assistant-submit', submit)
  root.addEventListener('assistant-save-draft', saveDraft)
  root.addEventListener('assistant-confirm-draft', confirmDraft)
  root.addEventListener('assistant-interrupt', interrupt)
  if (trackPageUrl) {
    stopPageNavigation = observeAssistantPageNavigation(() => sdk.updateContext({
      page: currentAssistantPageContext(currentContext.page),
      businessObject: undefined,
    }))
  }
  transport?.start(emitTransportState)
  return sdk
}

function ensureRoot(): HTMLElement {
  const existing = document.getElementById(ROOT_ELEMENT_ID)
  if (existing) return existing
  const root = document.createElement('div')
  root.id = ROOT_ELEMENT_ID
  root.dataset.open = 'false'
  document.body.append(root)
  return root
}

function pickMutableContext(options: AssistantInitOptions) {
  return copyContext(options)
}

function copyContext(context: Pick<AssistantInitOptions, 'user' | 'page' | 'businessObject'>) {
  const result: Pick<AssistantInitOptions, 'user' | 'page' | 'businessObject'> = {}
  if (Object.hasOwn(context, 'user')) {
    result.user = context.user
      ? { ...context.user, roles: context.user.roles ? [...context.user.roles] : undefined }
      : undefined
  }
  if (Object.hasOwn(context, 'page')) {
    result.page = context.page ? { ...context.page } : undefined
  }
  if (Object.hasOwn(context, 'businessObject')) {
    result.businessObject = context.businessObject
      ? { ...context.businessObject, attributes: context.businessObject.attributes
          ? structuredClone(context.businessObject.attributes) : undefined }
      : undefined
  }
  return result
}

export function currentAssistant(): AssistantSdk | undefined {
  return singleton
}

function isFeedbackArchiveClient(value: unknown): value is import('./types').AssistantFeedbackArchiveClient {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<import('./types').AssistantFeedbackArchiveClient>
  return typeof candidate.listSessions === 'function'
    && typeof candidate.listCandidates === 'function'
    && typeof candidate.listRevisions === 'function'
    && typeof candidate.updateCandidate === 'function'
    && typeof candidate.loadAttachment === 'function'
}
