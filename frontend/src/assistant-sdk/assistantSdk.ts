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

const ROOT_ELEMENT_ID = 'kai-assistant-widget-root'

let singleton: AssistantSdk | undefined

export function initializeAssistant(options: AssistantInitOptions): AssistantSdk {
  if (singleton) return singleton

  let currentContext = pickMutableContext(options)
  const providers = new Map(options.providers?.map(provider => [provider.id, provider]) ?? [])
  const root = ensureRoot()
  const externalLogin = !options.transport && options.wsUrl && !options.getAccessToken && options.externalLogin
    ? new AssistantExternalLoginClient(options.externalLogin)
    : undefined
  const authentication = externalLogin ? {
    authenticated: externalLogin.isAuthenticated(),
    login: (username: string, password: string) => externalLogin.login(username, password),
  } : undefined
  const unmountWidget = (options.mountWidget ?? mountAssistantWidget)(root, {
    visibility: options.visibility,
    draggable: options.draggable ?? true,
    positionStorageKey: `kai-assistant:position:${options.appId}:${options.user?.id ?? 'anonymous'}`,
    authentication,
  })
  const transport = options.transport ?? (options.wsUrl ? new AssistantWebSocketTransport({
    appId: options.appId,
    userId: options.user?.id,
    wsUrl: options.wsUrl,
    getAccessToken: options.getAccessToken ?? (() => externalLogin?.requireAccessToken()),
    authenticationRequired: Boolean(externalLogin),
    workspace: options.workspace,
    engine: options.engine,
  }) : undefined)
  let opened = false
  let usersRequested = false
  let activePreparation: AbortController | undefined

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
      root.removeEventListener('assistant-mode-change', modeChange)
      root.removeEventListener('assistant-interrupt', interrupt)
      root.removeEventListener('assistant-hidden', hidden)
      activePreparation?.abort('assistant-destroyed')
      transport?.destroy()
      externalLogin?.clear()
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
    const detail = (event as CustomEvent<{ mode: AssistantMode; text: string }>).detail
    if (!transport) {
      emitTransportState({
        state: '配置缺失',
        message: '未配置 Assistant WebSocket 地址，请检查初始化参数 wsUrl',
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
  const modeChange = (event: Event) => {
    const mode = (event as CustomEvent<{ mode: AssistantMode }>).detail.mode
    if (!usersRequested && (mode === 'BUG' || mode === 'SUGGESTION') && transport?.listUsers) {
      usersRequested = true
      transport.listUsers()
    }
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
  root.addEventListener('assistant-mode-change', modeChange)
  root.addEventListener('assistant-interrupt', interrupt)
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
