import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type {
  AssistantConversationMessage,
  AssistantDebugEntry,
  AssistantMode,
  AssistantShortcut,
  AssistantWidgetAuthentication,
  AssistantWidgetMountOptions,
  AssistantWidgetState,
} from './types'
import { AssistantPositionController } from './widgetPosition'
import { deriveWidgetInteractionState } from './widgetInteractionState'
import { MAX_ASSISTANT_DEBUG_ENTRIES } from './assistantDebugLog'

const ELEMENT_NAME = 'kai-assistant-widget'
const DEFAULT_SHORTCUT: Required<AssistantShortcut> = {
  key: '0', ctrlOrMeta: true, shift: true, alt: true,
}

export function mountAssistantWidget(root: HTMLElement, options: AssistantWidgetMountOptions = {}): () => void {
  defineWidget()
  const widget = document.createElement(ELEMENT_NAME) as AssistantWidgetElement
  widget.configure(options)
  root.append(widget)
  const open = (event: Event) => widget.open((event as CustomEvent<{ mode: AssistantMode }>).detail.mode)
  const close = () => widget.close()
  const state = (event: Event) => widget.setState((event as CustomEvent).detail)
  root.addEventListener('kai-assistant-open', open)
  root.addEventListener('kai-assistant-close', close)
  root.addEventListener('kai-assistant-state', state)
  return () => {
    root.removeEventListener('kai-assistant-open', open)
    root.removeEventListener('kai-assistant-close', close)
    root.removeEventListener('kai-assistant-state', state)
    widget.remove()
  }
}

class AssistantWidgetElement extends HTMLElement {
  private readonly launcher: HTMLButtonElement
  private readonly panel: HTMLElement
  private readonly panelHeader: HTMLElement
  private readonly modeLabel: HTMLElement
  private readonly stateLabel: HTMLElement
  private readonly activity: HTMLElement
  private readonly messageList: HTMLElement
  private readonly messageInput: HTMLTextAreaElement
  private readonly submitButton: HTMLButtonElement
  private readonly interruptButton: HTMLButtonElement
  private readonly conversation: HTMLElement
  private readonly emptyState: HTMLElement
  private readonly notice: HTMLElement
  private readonly draftActions: HTMLElement
  private readonly confirmButton: HTMLButtonElement
  private readonly engineerSelect: HTMLSelectElement
  private readonly unlockLayer: HTMLElement
  private readonly unlockInput: HTMLInputElement
  private readonly unlockError: HTMLElement
  private readonly authenticationPanel: HTMLElement
  private readonly authenticatedContent: HTMLElement
  private readonly loginForm: HTMLFormElement
  private readonly loginUsername: HTMLInputElement
  private readonly loginPassword: HTMLInputElement
  private readonly loginButton: HTMLButtonElement
  private readonly loginError: HTMLElement
  private readonly debugToggle: HTMLButtonElement
  private readonly debugPanel: HTMLElement
  private readonly debugList: HTMLElement
  private draftId: string | null = null
  private mode: AssistantMode = 'AUTO'
  private lastSubmittedText = ''
  private conversationMessages: AssistantConversationMessage[] = []
  private interactionBusy = false
  private activationKey = ''
  private shortcut = DEFAULT_SHORTCUT
  private positionController?: AssistantPositionController
  private connected = false
  private authentication?: AssistantWidgetAuthentication
  private authenticated = true
  private authenticating = false
  private debugEntries: AssistantDebugEntry[] = []
  private readonly globalKeyDown = (event: KeyboardEvent) => this.handleGlobalShortcut(event)

  constructor() {
    super()
    const shadow = this.attachShadow({ mode: 'open' })
    shadow.innerHTML = template
    this.launcher = required(shadow, '[data-launcher]')
    this.panel = required(shadow, '[data-panel]')
    this.panelHeader = required(shadow, '[data-panel-header]')
    this.modeLabel = required(shadow, '[data-mode-label]')
    this.stateLabel = required(shadow, '[data-state-label]')
    this.activity = required(shadow, '[data-activity]')
    this.messageList = required(shadow, '[data-message-list]')
    this.messageInput = required(shadow, '[data-message]')
    this.submitButton = required(shadow, '[data-submit]')
    this.interruptButton = required(shadow, '[data-interrupt]')
    this.conversation = required(shadow, '[data-conversation]')
    this.emptyState = required(shadow, '[data-empty-state]')
    this.notice = required(shadow, '[data-notice]')
    this.draftActions = required(shadow, '[data-draft-actions]')
    this.confirmButton = required(shadow, '[data-confirm-draft]')
    this.engineerSelect = required(shadow, '[data-engineer]')
    this.unlockLayer = required(shadow, '[data-unlock]')
    this.unlockInput = required(shadow, '[data-unlock-input]')
    this.unlockError = required(shadow, '[data-unlock-error]')
    this.authenticationPanel = required(shadow, '[data-authentication]')
    this.authenticatedContent = required(shadow, '[data-authenticated-content]')
    this.loginForm = required(shadow, '[data-login-form]')
    this.loginUsername = required(shadow, '[data-login-username]')
    this.loginPassword = required(shadow, '[data-login-password]')
    this.loginButton = required(shadow, '[data-login-submit]')
    this.loginError = required(shadow, '[data-login-error]')
    this.debugToggle = required(shadow, '[data-debug-toggle]')
    this.debugPanel = required(shadow, '[data-debug-panel]')
    this.debugList = required(shadow, '[data-debug-list]')
    this.launcher.addEventListener('click', () => {
      if (!this.positionController?.consumeDrag(this.launcher)) this.open('AUTO')
    })
    required(shadow, '[data-close]').addEventListener('click', () => this.close())
    required(shadow, '[data-hide-assistant]').addEventListener('click', () => this.hideAssistant())
    required(shadow, '[data-reset-position]').addEventListener('click', () => this.positionController?.reset())
    required(shadow, '[data-unlock-submit]').addEventListener('click', () => this.submitUnlock())
    required(shadow, '[data-unlock-cancel]').addEventListener('click', () => this.cancelUnlock())
    this.unlockInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') this.submitUnlock()
      if (event.key === 'Escape') this.cancelUnlock()
    })
    this.loginForm.addEventListener('submit', event => {
      event.preventDefault()
      void this.submitLogin()
    })
    this.submitButton.addEventListener('click', () => this.submit())
    this.interruptButton.addEventListener('click', () => this.interrupt())
    this.debugToggle.addEventListener('click', () => this.toggleDebugPanel())
    required(shadow, '[data-debug-clear]').addEventListener('click', () => this.clearDebugLog())
    this.messageInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        this.submit()
      }
    })
    this.messageInput.addEventListener('input', () => this.syncSubmitAvailability())
    required(shadow, '[data-save-draft]').addEventListener('click', () => this.saveDraft())
    this.confirmButton.addEventListener('click', () => this.confirmDraft())
    shadow.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      button.addEventListener('click', () => this.selectMode(button.dataset.mode as AssistantMode))
    })
    this.syncSubmitAvailability()
  }

  configure(options: AssistantWidgetMountOptions): void {
    this.authentication = options.authentication
    this.authenticated = options.authentication?.authenticated ?? true
    this.syncAuthenticationView()
    this.activationKey = options.visibility?.activationKey ?? ''
    const shortcut = options.visibility?.shortcut
    this.shortcut = {
      key: shortcut?.key ?? DEFAULT_SHORTCUT.key,
      ctrlOrMeta: shortcut?.ctrlOrMeta ?? DEFAULT_SHORTCUT.ctrlOrMeta,
      shift: shortcut?.shift ?? DEFAULT_SHORTCUT.shift,
      alt: shortcut?.alt ?? DEFAULT_SHORTCUT.alt,
    }
    this.launcher.hidden = options.visibility?.initiallyHidden ?? false
    this.positionController = new AssistantPositionController({
      launcher: this.launcher,
      panel: this.panel,
      panelHandle: this.panelHeader,
      storageKey: options.positionStorageKey ?? 'kai-assistant:position:default',
      enabled: options.draggable ?? true,
    })
  }

  connectedCallback(): void {
    if (this.connected) return
    this.connected = true
    document.addEventListener('keydown', this.globalKeyDown, true)
    this.positionController?.start()
  }

  disconnectedCallback(): void {
    if (!this.connected) return
    this.connected = false
    document.removeEventListener('keydown', this.globalKeyDown, true)
    this.positionController?.destroy()
  }

  open(mode: AssistantMode): void {
    this.reveal()
    this.selectMode(mode)
    this.panel.hidden = false
    this.positionController?.refresh()
    const focusTarget = this.authenticated ? this.panel.querySelector<HTMLElement>('[data-close]') : this.loginUsername
    focusTarget?.focus()
  }

  close(): void {
    this.panel.hidden = true
    if (!this.launcher.hidden) this.launcher.focus()
  }

  private handleGlobalShortcut(event: KeyboardEvent): void {
    if (event.repeat || !matchesShortcut(event, this.shortcut)) return
    event.preventDefault()
    if (!this.launcher.hidden || !this.panel.hidden) {
      this.hideAssistant()
      return
    }
    if (this.activationKey) this.requestUnlock()
    else this.open('AUTO')
  }

  private requestUnlock(): void {
    this.unlockError.hidden = true
    this.unlockLayer.hidden = false
    queueMicrotask(() => this.unlockInput.focus())
  }

  private submitUnlock(): void {
    if (this.unlockInput.value !== this.activationKey) {
      this.unlockError.hidden = false
      this.unlockInput.select()
      return
    }
    this.unlockInput.value = ''
    this.unlockError.hidden = true
    this.unlockLayer.hidden = true
    this.open('AUTO')
  }

  private cancelUnlock(): void {
    this.unlockInput.value = ''
    this.unlockError.hidden = true
    this.unlockLayer.hidden = true
  }

  private reveal(): void {
    this.launcher.hidden = false
    this.unlockLayer.hidden = true
  }

  private hideAssistant(): void {
    this.panel.hidden = true
    this.launcher.hidden = true
    this.unlockLayer.hidden = true
    this.dispatchEvent(new CustomEvent('assistant-hidden', { bubbles: true }))
  }

  private selectMode(mode: AssistantMode): void {
    this.mode = mode
    this.modeLabel.textContent = modeLabels[mode]
    this.draftActions.hidden = mode !== 'BUG' && mode !== 'SUGGESTION'
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      const selected = button.dataset.mode === mode
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    this.dispatchEvent(new CustomEvent('assistant-mode-change', { detail: { mode }, bubbles: true }))
  }

  setState(detail: AssistantWidgetState): void {
    if (detail.debugEntry) this.appendDebugEntry(detail.debugEntry)
    if (detail.authenticationRequired && this.authentication) {
      this.authenticated = false
      this.loginError.textContent = detail.message ?? '请重新登录 Forge 账号'
      this.loginError.hidden = false
      this.syncAuthenticationView()
    }
    if (detail.messages) this.renderConversation(detail.messages)
    if (detail.state) {
      const interaction = deriveWidgetInteractionState(detail.state, detail.queueSize)
      this.interactionBusy = interaction.busy
      this.stateLabel.textContent = interaction.activityLabel
      this.stateLabel.dataset.state = detail.state
      this.activity.dataset.state = detail.state
      this.activity.dataset.tone = interaction.tone
      this.activity.hidden = !interaction.activityVisible
      this.interruptButton.hidden = !interaction.interruptible
      this.interruptButton.disabled = detail.state === '正在中止'
      this.syncSubmitAvailability()
      this.syncConversationVisibility()
    }
    if (detail.message) {
      this.notice.textContent = detail.message
      this.notice.hidden = false
    } else if (detail.messages) {
      this.notice.hidden = true
    }
    if (detail.draftId) {
      this.draftId = detail.draftId
      this.confirmButton.hidden = false
    }
    if (detail.users) {
      this.engineerSelect.replaceChildren(new Option('暂不指定工程师', ''))
      detail.users.forEach(user => this.engineerSelect.add(new Option(
        user.displayName || user.username || `用户 ${user.userId}`, String(user.userId),
      )))
    }
  }

  private submit(): void {
    if (this.interactionBusy) return
    const text = this.messageInput.value.trim()
    if (!text) return
    this.lastSubmittedText = text
    this.conversationMessages = [...this.conversationMessages, {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }]
    this.renderConversation(this.conversationMessages)
    this.messageInput.value = ''
    this.setState({ state: '正在准备上下文' })
    this.dispatchEvent(new CustomEvent('assistant-submit', {
      detail: { mode: this.mode, text }, bubbles: true,
    }))
  }

  private interrupt(): void {
    if (this.interruptButton.disabled) return
    this.interruptButton.disabled = true
    this.dispatchEvent(new CustomEvent('assistant-interrupt', { bubbles: true }))
  }

  private toggleDebugPanel(): void {
    const opening = this.debugPanel.hidden
    this.debugPanel.hidden = !opening
    this.debugToggle.setAttribute('aria-expanded', String(opening))
    if (opening) this.debugList.scrollTop = this.debugList.scrollHeight
  }

  private clearDebugLog(): void {
    this.debugEntries = []
    this.debugList.replaceChildren()
  }

  private appendDebugEntry(entry: AssistantDebugEntry): void {
    if (this.debugEntries.some(item => item.id === entry.id)) return
    this.debugEntries = [...this.debugEntries, entry].slice(-MAX_ASSISTANT_DEBUG_ENTRIES)
    const row = document.createElement('li')
    row.className = 'debug-row'
    const time = document.createElement('time')
    time.dateTime = new Date(entry.timestamp).toISOString()
    time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour12: false })
    const body = document.createElement('span')
    body.textContent = entry.summary
    const detail = document.createElement('code')
    detail.textContent = formatDebugDetail(entry.detail)
    detail.hidden = !detail.textContent
    row.append(time, body, detail)
    this.debugList.append(row)
    while (this.debugList.childElementCount > MAX_ASSISTANT_DEBUG_ENTRIES) {
      this.debugList.firstElementChild?.remove()
    }
    if (!this.debugPanel.hidden) this.debugList.scrollTop = this.debugList.scrollHeight
  }

  private async submitLogin(): Promise<void> {
    if (!this.authentication || this.authenticating) return
    const username = this.loginUsername.value.trim()
    const password = this.loginPassword.value
    if (!username || !password) {
      this.loginError.textContent = '请输入 Forge 账号和密码'
      this.loginError.hidden = false
      return
    }
    this.authenticating = true
    this.loginButton.disabled = true
    this.loginButton.textContent = '登录中…'
    this.loginError.hidden = true
    try {
      await this.authentication.login(username, password)
      this.authenticated = true
      this.loginPassword.value = ''
      this.loginError.hidden = true
      this.syncAuthenticationView()
      this.setState({ state: '已就绪' })
      this.messageInput.focus()
    } catch (error) {
      this.loginPassword.value = ''
      this.loginError.textContent = error instanceof Error ? error.message : 'Forge 登录失败，请重试'
      this.loginError.hidden = false
      this.loginPassword.focus()
    } finally {
      this.authenticating = false
      this.loginButton.disabled = false
      this.loginButton.textContent = '登录并继续'
    }
  }

  private syncAuthenticationView(): void {
    const authenticationRequired = Boolean(this.authentication) && !this.authenticated
    this.authenticationPanel.hidden = !authenticationRequired
    this.authenticatedContent.hidden = authenticationRequired
  }

  private saveDraft(): void {
    const description = this.messageInput.value.trim() || this.lastSubmittedText
    if (!description) return
    const title = description.length > 40 ? `${description.slice(0, 40)}…` : description
    this.dispatchEvent(new CustomEvent('assistant-save-draft', {
      detail: { kind: this.mode, title, description }, bubbles: true,
    }))
  }

  private confirmDraft(): void {
    if (!this.draftId) return
    this.dispatchEvent(new CustomEvent('assistant-confirm-draft', {
      detail: {
        draftId: this.draftId,
        engineerUserId: this.engineerSelect.value ? Number(this.engineerSelect.value) : undefined,
      },
      bubbles: true,
    }))
  }

  private renderConversation(messages: AssistantConversationMessage[]): void {
    const shouldStickToBottom = this.conversation.scrollHeight - this.conversation.scrollTop
      <= this.conversation.clientHeight + 80
    const fragment = document.createDocumentFragment()
    this.conversationMessages = messages.map(message => ({ ...message }))
    this.conversationMessages.forEach(message => fragment.append(this.renderMessage(message)))
    this.messageList.replaceChildren(fragment)
    this.syncConversationVisibility()
    if (shouldStickToBottom) this.conversation.scrollTop = this.conversation.scrollHeight
  }

  private syncSubmitAvailability(): void {
    const hasMessage = this.messageInput.value.trim().length > 0
    this.submitButton.disabled = this.interactionBusy || !hasMessage
    this.submitButton.title = this.interactionBusy
      ? '当前回合处理中，完成后可继续发送'
      : hasMessage ? '发送消息' : '请输入消息'
  }

  private syncConversationVisibility(): void {
    const visible = this.conversationMessages.length > 0 || !this.activity.hidden
    this.emptyState.hidden = visible
    this.conversation.hidden = !visible
  }

  private renderMessage(message: AssistantConversationMessage): HTMLElement {
    const article = document.createElement('article')
    article.className = `message ${message.role}`
    article.dataset.messageId = message.id

    const meta = document.createElement('div')
    meta.className = 'message-meta'
    meta.textContent = message.role === 'user' ? '你' : 'AI 助手'
    const body = document.createElement('div')
    body.className = 'message-body'
    if (message.role === 'assistant') {
      const html = marked.parse(message.content, { async: false, breaks: true }) as string
      body.innerHTML = DOMPurify.sanitize(html)
    } else {
      body.textContent = message.content
    }
    article.append(meta, body)
    if (message.streaming) {
      const streaming = document.createElement('span')
      streaming.className = 'streaming'
      streaming.textContent = '正在生成'
      article.append(streaming)
    }
    return article
  }
}

function defineWidget(): void {
  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, AssistantWidgetElement)
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Assistant widget element missing: ${selector}`)
  return element
}

function matchesShortcut(event: KeyboardEvent, shortcut: Required<AssistantShortcut>): boolean {
  const keyMatches = matchesShortcutKey(event, shortcut.key)
  const ctrlOrMetaMatches = (event.ctrlKey || event.metaKey) === shortcut.ctrlOrMeta
  return keyMatches && ctrlOrMetaMatches
    && event.shiftKey === shortcut.shift
    && event.altKey === shortcut.alt
}

function matchesShortcutKey(event: KeyboardEvent, configuredKey: string): boolean {
  const expectedKey = configuredKey.toLocaleLowerCase()
  if (event.key.toLocaleLowerCase() === expectedKey) {
    return true
  }

  return physicalKeyFromCode(event.code) === expectedKey
}

function physicalKeyFromCode(code: string): string | undefined {
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3).toLocaleLowerCase()
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5)
  }
  if (code.startsWith('Numpad') && code.length === 7) {
    return code.slice(6)
  }
  return undefined
}

const modeLabels: Record<AssistantMode, string> = {
  AUTO: '自动识别',
  QUESTION: '业务咨询',
  BUG: '报告问题',
  SUGGESTION: '提出建议',
  DIAGNOSE: '协助诊断',
}

function formatDebugDetail(detail?: AssistantDebugEntry['detail']): string {
  if (!detail) return ''
  return Object.entries(detail)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' · ')
}

const template = `
  <style>
    :host { color: #18181b; font: 14px/1.55 Inter, "PingFang SC", "Microsoft YaHei", sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button, textarea, select { font: inherit; }
    button { touch-action: manipulation; }
    .launcher { position: fixed; right: 24px; bottom: 24px; z-index: 2147483000; display: grid; place-items: center; width: 72px; height: 44px; padding: 5px; border: 1px solid rgb(24 24 27 / 18%); border-radius: 999px; background: rgb(255 255 255 / 94%); box-shadow: 0 8px 24px rgb(0 0 0 / 14%); cursor: grab; touch-action: none; transition: box-shadow 160ms ease, transform 160ms ease; }
    .launcher:hover { box-shadow: 0 10px 28px rgb(0 0 0 / 18%); transform: translateY(-1px); }
    .launcher:active, .dragging { cursor: grabbing; transform: scale(.98); }
    .capsule-icon { position: relative; display: block; width: 60px; height: 32px; overflow: hidden; border: 1px solid rgb(24 24 27 / 18%); border-radius: 999px; background: linear-gradient(105deg, #f43f5e 0%, #fb923c 21%, #fde047 40%, #34d399 59%, #38bdf8 78%, #8b5cf6 100%); box-shadow: inset 0 1px 1px rgb(255 255 255 / 58%), inset 0 -1px 2px rgb(24 24 27 / 16%); }
    .capsule-icon::before { position: absolute; top: 3px; left: -52%; width: 42%; height: 26px; border-radius: 999px; background: linear-gradient(90deg, transparent, rgb(255 255 255 / 82%), transparent); content: ""; opacity: 0; transform: skewX(-18deg); }
    .capsule-icon::after { position: absolute; top: -4px; left: 50%; width: 2px; height: 40px; background: rgb(255 255 255 / 78%); box-shadow: 1px 0 rgb(24 24 27 / 10%); content: ""; transform: rotate(12deg); transform-origin: center; }
    .launcher:focus-visible, .action:focus-visible, .close:focus-visible, .submit:focus-visible, .panel-header:focus-visible, textarea:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
    .panel { position: fixed; top: 16px; right: 16px; z-index: 2147483001; width: min(560px, calc(100vw - 32px)); height: min(760px, calc(100vh - 32px)); background: #f7f7f8; border: 1px solid #dedee3; border-radius: 10px; box-shadow: 0 20px 48px rgb(0 0 0 / 12%); overflow: hidden; }
    .shell { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; }
    .assistant-content { display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto auto auto; min-height: 0; }
    .panel-header { display: flex; align-items: center; justify-content: space-between; min-height: 72px; padding: 16px 14px 16px 22px; border-bottom: 1px solid #e4e4e7; background: #fff; cursor: grab; user-select: none; touch-action: none; }
    .panel-header:active { cursor: grabbing; }
    .header-actions { display: flex; align-items: center; gap: 2px; }
    .eyebrow { margin: 0 0 2px; color: #71717a; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    h2 { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -.015em; }
    .close { min-width: 44px; min-height: 36px; border: 0; border-radius: 7px; background: transparent; color: #52525b; cursor: pointer; }
    .close:hover { background: #f4f4f5; color: #18181b; }
    .unlock-layer { position: fixed; inset: 0; z-index: 2147483002; display: grid; place-items: center; background: rgb(24 24 27 / 22%); padding: 20px; }
    .unlock-dialog { width: min(360px, 100%); border: 1px solid #d4d4d8; border-radius: 10px; background: #fff; box-shadow: 0 18px 48px rgb(0 0 0 / 16%); padding: 20px; }
    .unlock-dialog h2 { margin: 0 0 6px; font-size: 17px; }
    .unlock-dialog p { margin: 0 0 14px; color: #71717a; font-size: 12px; }
    .unlock-dialog label { display: grid; gap: 6px; color: #3f3f46; font-size: 12px; font-weight: 600; }
    .unlock-dialog input { min-height: 40px; width: 100%; border: 1px solid #cfcfd5; border-radius: 7px; padding: 0 10px; color: #18181b; }
    .unlock-error { margin-top: 8px !important; color: #b91c1c !important; }
    .unlock-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .authentication { min-height: 0; overflow-y: auto; background: #fff; padding: 28px 22px; }
    .login-form { width: min(380px, 100%); margin: 0 auto; }
    .login-form h3 { margin: 0 0 7px; font-size: 18px; font-weight: 650; letter-spacing: -.012em; }
    .login-form > p { margin: 0 0 20px; color: #71717a; font-size: 12px; }
    .login-fields { display: grid; gap: 13px; }
    .login-fields label { display: grid; gap: 6px; color: #3f3f46; font-size: 12px; font-weight: 600; }
    .login-fields input { min-height: 42px; width: 100%; border: 1px solid #cfcfd5; border-radius: 7px; padding: 0 11px; color: #18181b; }
    .login-error { margin: 10px 0 0 !important; color: #b91c1c !important; }
    .login-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
    .modes { display: flex; gap: 6px; overflow-x: auto; padding: 10px 22px; border-bottom: 1px solid #e4e4e7; background: #fff; }
    .action { flex: 0 0 auto; min-height: 34px; padding: 0 10px; border: 1px solid #d4d4d8; border-radius: 7px; background: #fff; color: #52525b; cursor: pointer; }
    .action:hover { border-color: #a1a1aa; color: #18181b; }
    .action.selected { border-color: #c7d2fe; background: #eef2ff; color: #3730a3; font-weight: 600; }
    .context-strip { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 9px 22px; border-bottom: 1px solid #e4e4e7; background: #fafafa; }
    .context { margin: 0; color: #71717a; font-size: 12px; }
    .mode { margin: 0; color: #18181b; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .debug-panel { max-height: 190px; overflow: hidden; border-bottom: 1px solid #dedee3; background: #18181b; color: #d4d4d8; }
    .debug-header { display: flex; align-items: center; justify-content: space-between; padding: 7px 12px 6px; color: #a1a1aa; font-size: 11px; }
    .debug-clear { border: 0; background: transparent; color: #a1a1aa; cursor: pointer; font-size: 11px; }
    .debug-clear:hover { color: #fff; }
    .debug-list { max-height: 154px; margin: 0; overflow: auto; padding: 0 12px 9px; list-style: none; font: 11px/1.55 "SFMono-Regular", Consolas, monospace; }
    .debug-row { display: grid; grid-template-columns: 66px minmax(120px, auto) minmax(0, 1fr); gap: 8px; padding: 3px 0; border-top: 1px solid rgb(255 255 255 / 7%); }
    .debug-row time { color: #71717a; }
    .debug-row code { overflow-wrap: anywhere; color: #a5b4fc; }
    .empty { align-self: center; padding: 40px 36px; text-align: center; }
    .empty h3 { margin: 0 0 8px; font-size: 17px; font-weight: 650; }
    .empty p { max-width: 34em; margin: 0 auto; color: #71717a; }
    .conversation { min-height: 0; overflow-y: auto; padding: 22px; scroll-behavior: smooth; overscroll-behavior: contain; }
    .activity { display: flex; align-items: center; gap: 9px; min-height: 28px; margin: 2px 4px 16px; color: #52525b; font-size: 12px; font-weight: 600; }
    .activity::before { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: #4f46e5; content: ""; animation: pulse 1.2s ease-in-out infinite; }
    .activity[data-tone="warning"]::before { background: #f59e0b; animation: none; }
    .activity[data-tone="error"] { color: #b91c1c; }
    .activity[data-tone="error"]::before { background: #ef4444; animation: none; }
    .message { width: fit-content; max-width: 88%; margin: 0 0 18px; }
    .message.user { margin-left: auto; }
    .message.assistant { margin-right: auto; }
    .message-meta { margin: 0 4px 6px; color: #71717a; font-size: 11px; font-weight: 650; }
    .user .message-meta { text-align: right; }
    .message-body { overflow-wrap: anywhere; }
    .user .message-body { padding: 10px 13px; border: 1px solid #d4d4d8; border-radius: 12px 12px 3px 12px; background: #fff; white-space: pre-wrap; }
    .assistant .message-body { width: 100%; padding: 1px 4px; color: #27272a; }
    .assistant .message-body > :first-child { margin-top: 0; }
    .assistant .message-body > :last-child { margin-bottom: 0; }
    .assistant h1, .assistant h2, .assistant h3 { margin: 1.2em 0 .55em; color: #18181b; line-height: 1.3; letter-spacing: -.012em; }
    .assistant h1 { font-size: 20px; } .assistant h2 { font-size: 17px; } .assistant h3 { font-size: 15px; }
    .assistant p, .assistant ul, .assistant ol, .assistant blockquote, .assistant pre { margin: .65em 0; }
    .assistant ul, .assistant ol { padding-left: 1.4em; }
    .assistant li + li { margin-top: .25em; }
    .assistant a { color: #4338ca; text-underline-offset: 2px; }
    .assistant code { border-radius: 4px; background: #eeeef0; padding: .12em .32em; font: 12px/1.5 "SFMono-Regular", Consolas, monospace; }
    .assistant pre { overflow-x: auto; border: 1px solid #dedee3; border-radius: 8px; background: #f1f1f3; padding: 12px; }
    .assistant pre code { background: transparent; padding: 0; }
    .assistant blockquote { border-left: 3px solid #a5b4fc; padding-left: 12px; color: #52525b; }
    .assistant table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .assistant th, .assistant td { border-bottom: 1px solid #dedee3; padding: 7px 8px; text-align: left; }
    .streaming { display: inline-flex; align-items: center; gap: 6px; margin: 6px 4px 0; color: #4f46e5; font-size: 11px; font-weight: 600; }
    .streaming::before { width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ""; animation: pulse 1.2s ease-in-out infinite; }
    .composer { border-top: 1px solid #dedee3; background: #fff; padding: 14px 22px 12px; }
    .composer-label { display: flex; justify-content: space-between; margin-bottom: 7px; color: #52525b; font-size: 12px; font-weight: 600; }
    textarea { display: block; width: 100%; min-height: 82px; max-height: 180px; resize: vertical; border: 1px solid #cfcfd5; border-radius: 9px; background: #fff; padding: 11px 12px; color: inherit; line-height: 1.5; }
    textarea::placeholder { color: #a1a1aa; }
    .composer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 9px; }
    .submit { min-height: 36px; padding: 0 15px; border: 1px solid #18181b; border-radius: 7px; background: #18181b; color: #fff; cursor: pointer; }
    .submit:hover { background: #27272a; }
    .submit:disabled { cursor: not-allowed; opacity: .45; }
    .interrupt { min-height: 36px; padding: 0 13px; border: 1px solid #fecaca; border-radius: 7px; background: #fff; color: #b91c1c; cursor: pointer; }
    .interrupt:hover { background: #fef2f2; }
    .interrupt:disabled { cursor: wait; opacity: .55; }
    .notice { margin: 0 22px 10px; border: 1px solid #fde68a; border-radius: 7px; background: #fffbeb; padding: 8px 10px; color: #854d0e; font-size: 12px; }
    select { min-height: 34px; min-width: 160px; max-width: 220px; border: 1px solid #d4d4d8; border-radius: 7px; background: #fff; padding: 0 8px; color: inherit; }
    footer { display: flex; justify-content: space-between; gap: 12px; padding: 10px 22px 13px; border-top: 1px solid #eeeeef; background: #fff; color: #71717a; font-size: 11px; }
    @media (max-width: 620px) {
      .panel { inset: 0 !important; width: auto; height: auto; border: 0; border-radius: 0; }
      .panel-header { min-height: 64px; padding: 12px 8px 12px 16px; cursor: default; touch-action: auto; }
      .close { min-width: 40px; padding: 0 6px; }
      .modes { padding-inline: 16px; }
      .context-strip { align-items: flex-start; flex-direction: column; gap: 3px; padding: 8px 16px; }
      .mode { white-space: normal; }
      .composer { padding-inline: 16px; }
      .composer-label { gap: 12px; }
      footer { flex-wrap: wrap; padding-inline: 16px; }
      .launcher { right: 16px; bottom: 16px; }
      .message { max-width: 94%; }
      [data-reset-position] { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .launcher { transition: none; } }
    @media (prefers-reduced-motion: no-preference) { .launcher:hover .capsule-icon::before { animation: capsule-glint 520ms ease-out 1; } .panel { animation: enter 160ms ease-out; } @keyframes capsule-glint { 0% { left: -52%; opacity: 0; } 24% { opacity: .8; } 100% { left: 112%; opacity: 0; } } @keyframes enter { from { transform: translateX(12px); } } @keyframes pulse { 50% { opacity: .3; transform: scale(.8); } } }
  </style>
  <button class="launcher" type="button" data-launcher aria-label="打开 AI 助手" title="打开 AI 助手；拖动调整位置；Alt + 方向键微调"><span class="capsule-icon" aria-hidden="true"></span></button>
  <section class="unlock-layer" data-unlock role="dialog" aria-modal="true" aria-labelledby="assistant-unlock-title" hidden>
    <div class="unlock-dialog">
      <h2 id="assistant-unlock-title">显示 AI 助手</h2>
      <p>输入本页面配置的显示密钥。该密钥只控制界面显示，不用于身份认证。</p>
      <label>显示密钥<input type="password" data-unlock-input autocomplete="off" /></label>
      <p class="unlock-error" data-unlock-error role="alert" hidden>密钥不正确，请重新输入。</p>
      <div class="unlock-actions">
        <button class="action" type="button" data-unlock-cancel>取消</button>
        <button class="submit" type="button" data-unlock-submit>显示助手</button>
      </div>
    </div>
  </section>
  <aside class="panel" data-panel aria-label="AI 助手" hidden>
    <div class="shell">
      <header class="panel-header" data-panel-header tabindex="0" aria-label="拖动 AI 助手对话框；Alt 加方向键微调">
        <div><p class="eyebrow">KAI Assistant</p><h2>业务助手</h2></div>
        <div class="header-actions" data-no-drag>
          <button class="close" type="button" data-debug-toggle aria-expanded="false" aria-controls="assistant-debug-panel">调试</button>
          <button class="close" type="button" data-reset-position>复位</button>
          <button class="close" type="button" data-hide-assistant>隐藏</button>
          <button class="close" type="button" data-close aria-label="关闭对话框">关闭</button>
        </div>
      </header>
      <section class="authentication" data-authentication hidden>
        <form class="login-form" data-login-form>
          <h3>登录 Forge 后开始咨询</h3>
          <p>使用现有 Forge 账号验证身份。密码只用于本次登录，不会保存在当前系统。</p>
          <div class="login-fields">
            <label>Forge 账号<input type="text" data-login-username autocomplete="username" /></label>
            <label>密码<input type="password" data-login-password autocomplete="current-password" /></label>
          </div>
          <p class="login-error" data-login-error role="alert" hidden></p>
          <div class="login-actions"><button class="submit" type="submit" data-login-submit>登录并继续</button></div>
        </form>
      </section>
      <div class="assistant-content" data-authenticated-content>
      <nav class="modes" aria-label="助手能力">
        <button class="action" type="button" data-mode="QUESTION" aria-pressed="false">咨询</button>
        <button class="action" type="button" data-mode="BUG" aria-pressed="false">Bug</button>
        <button class="action" type="button" data-mode="SUGGESTION" aria-pressed="false">建议</button>
        <button class="action" type="button" data-mode="DIAGNOSE" aria-pressed="false">诊断</button>
      </nav>
      <section class="context-strip" data-context-strip aria-label="当前上下文与模式">
        <p class="context">当前页面 · 发送时采集脱敏上下文</p>
        <p class="mode" data-mode-label>自动识别</p>
      </section>
      <section class="debug-panel" id="assistant-debug-panel" data-debug-panel aria-label="请求调试日志" hidden>
        <div class="debug-header"><span>请求调试日志 · 仅当前页面内存</span><button class="debug-clear" type="button" data-debug-clear>清空</button></div>
        <ol class="debug-list" data-debug-list></ol>
      </section>
      <section class="empty" data-empty-state>
        <h3>从当前业务页面开始对话</h3>
        <p>你可以咨询业务、报告问题、提出建议或协助诊断。连接未稳定时消息会进入待发送列表。</p>
      </section>
      <main class="conversation" data-conversation role="log" aria-live="polite" aria-label="对话消息" hidden>
        <div data-message-list></div>
        <div class="activity" data-activity role="status" aria-live="polite" hidden>
          <span data-state-label></span>
        </div>
      </main>
      <section class="composer">
        <label class="composer-label" for="assistant-message"><span>发送消息</span><span>Ctrl / ⌘ + Enter</span></label>
        <textarea id="assistant-message" data-message placeholder="例如：为什么这张订单无法审核？"></textarea>
        <div class="composer-actions">
          <button class="interrupt" type="button" data-interrupt hidden>中止</button>
          <button class="submit" type="button" data-submit>发送</button>
        </div>
        <div class="composer-actions" data-draft-actions hidden>
          <select data-engineer aria-label="选择工程师"><option value="">暂不指定工程师</option></select>
          <button class="action" type="button" data-save-draft>保存为草稿</button>
          <button class="submit" type="button" data-confirm-draft hidden>确认登记</button>
        </div>
      </section>
      <p class="notice" data-notice role="status" hidden></p>
      <footer><span>消息仅在本次请求中上传</span><span>可拖动 · Alt + 方向键微调</span></footer>
      </div>
    </div>
  </aside>
`
