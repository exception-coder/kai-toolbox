import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type {
  AssistantConversationMessage,
  AssistantDebugEntry,
  AssistantFeedbackArchiveClient,
  AssistantFeedbackCandidate,
  AssistantFeedbackCategory,
  AssistantFeedbackSession,
  AssistantConversationHistoryClient,
  AssistantConversationAttachment,
  AssistantImageAttachment,
  AssistantMode,
  AssistantShortcut,
  AssistantWidgetAuthentication,
  AssistantWidgetMountOptions,
  AssistantWidgetState,
} from './types'
import { appendImageFiles, attachmentPreviewUrl, collectClipboardImages, formatAttachmentSize } from './imageAttachments'
import { AssistantPositionController } from './widgetPosition'
import { deriveWidgetInteractionState } from './widgetInteractionState'
import { MAX_ASSISTANT_DEBUG_ENTRIES } from './assistantDebugLog'
import { AssistantConversationViewport } from './AssistantConversationViewport'
import { summarizeFeedbackCounts } from './feedbackSummary'
import { validateAssistantUserRequestBaseUrl } from './requestBaseUrlPreference'

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
  private readonly historyStatus: HTMLElement
  private readonly messageInput: HTMLTextAreaElement
  private readonly imageInput: HTMLInputElement
  private readonly attachmentList: HTMLElement
  private readonly attachmentPreview: HTMLElement
  private readonly attachmentPreviewImage: HTMLImageElement
  private readonly attachmentPreviewTitle: HTMLElement
  private readonly attachmentPreviewClose: HTMLButtonElement
  private readonly submitButton: HTMLButtonElement
  private readonly interruptButton: HTMLButtonElement
  private readonly conversation: HTMLElement
  private readonly emptyState: HTMLElement
  private readonly notice: HTMLElement
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
  private readonly loginConnection: HTMLElement
  private readonly loginConnectionInput: HTMLInputElement
  private readonly loginConnectionApply: HTMLButtonElement
  private readonly loginConnectionDefault: HTMLElement
  private readonly loginConnectionStatus: HTMLElement
  private readonly loginConnectionError: HTMLElement
  private readonly debugToggle: HTMLButtonElement
  private readonly debugPanel: HTMLElement
  private readonly debugList: HTMLElement
  private readonly connectionForm: HTMLFormElement
  private readonly connectionInput: HTMLInputElement
  private readonly connectionDefault: HTMLElement
  private readonly connectionError: HTMLElement
  private readonly connectionStatus: HTMLElement
  private readonly connectionReset: HTMLButtonElement
  private readonly feedbackButton: HTMLButtonElement
  private readonly feedbackSummary: HTMLElement
  private readonly chatContent: HTMLElement
  private readonly feedbackArchiveView: HTMLElement
  private readonly feedbackArchiveBody: HTMLElement
  private feedbackContextVersion = 0
  private conversationContextVersion = 0
  private mode: AssistantMode = 'AUTO'
  private attachments: AssistantImageAttachment[] = []
  private submittedAttachments: AssistantImageAttachment[] = []
  private readonly attachmentPreviewUrls = new Map<string, string>()
  private readonly attachmentPreviewLoads = new Map<string, Promise<string>>()
  private attachmentPreviewTrigger?: HTMLButtonElement
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
  private connectionSettings?: AssistantWidgetMountOptions['connectionSettings']
  private feedbackArchive?: AssistantFeedbackArchiveClient
  private conversationHistory?: AssistantConversationHistoryClient
  private readonly conversationViewport: AssistantConversationViewport
  private feedbackSessions: AssistantFeedbackSession[] = []
  private feedbackCandidates: AssistantFeedbackCandidate[] = []
  private activeFeedbackSession?: AssistantFeedbackSession
  private activeFeedbackCategory?: AssistantFeedbackCategory
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
    this.historyStatus = required(shadow, '[data-history-status]')
    this.messageInput = required(shadow, '[data-message]')
    this.imageInput = required(shadow, '[data-image-input]')
    this.attachmentList = required(shadow, '[data-attachment-list]')
    this.attachmentPreview = required(shadow, '[data-attachment-preview]')
    this.attachmentPreviewImage = required(shadow, '[data-attachment-preview-image]')
    this.attachmentPreviewTitle = required(shadow, '[data-attachment-preview-title]')
    this.attachmentPreviewClose = required(shadow, '[data-attachment-preview-close]')
    this.submitButton = required(shadow, '[data-submit]')
    this.interruptButton = required(shadow, '[data-interrupt]')
    this.conversation = required(shadow, '[data-conversation]')
    this.emptyState = required(shadow, '[data-empty-state]')
    this.notice = required(shadow, '[data-notice]')
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
    this.loginConnection = required(shadow, '[data-login-connection]')
    this.loginConnectionInput = required(shadow, '[data-login-connection-input]')
    this.loginConnectionApply = required(shadow, '[data-login-connection-apply]')
    this.loginConnectionDefault = required(shadow, '[data-login-connection-default]')
    this.loginConnectionStatus = required(shadow, '[data-login-connection-status]')
    this.loginConnectionError = required(shadow, '[data-login-connection-error]')
    this.debugToggle = required(shadow, '[data-debug-toggle]')
    this.debugPanel = required(shadow, '[data-debug-panel]')
    this.debugList = required(shadow, '[data-debug-list]')
    this.connectionForm = required(shadow, '[data-connection-form]')
    this.connectionInput = required(shadow, '[data-connection-input]')
    this.connectionDefault = required(shadow, '[data-connection-default]')
    this.connectionError = required(shadow, '[data-connection-error]')
    this.connectionStatus = required(shadow, '[data-connection-status]')
    this.connectionReset = required(shadow, '[data-connection-reset]')
    this.feedbackButton = required(shadow, '[data-feedback-open]')
    this.feedbackSummary = required(shadow, '[data-feedback-summary]')
    this.chatContent = required(shadow, '[data-chat-content]')
    this.feedbackArchiveView = required(shadow, '[data-feedback-archive]')
    this.feedbackArchiveBody = required(shadow, '[data-feedback-archive-body]')
    this.conversationViewport = new AssistantConversationViewport({
      scrollElement: this.conversation,
      listElement: this.messageList,
      renderMessage: message => this.renderMessage(message),
      onTopReached: () => this.conversationHistory?.loadEarlier(),
    })
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
    this.loginConnectionApply.addEventListener('click', () => {
      this.applyConnectionSetting(this.loginConnectionInput.value, 'login')
    })
    this.submitButton.addEventListener('click', () => this.submit())
    this.interruptButton.addEventListener('click', () => this.interrupt())
    this.debugToggle.addEventListener('click', () => this.toggleDebugPanel())
    this.connectionForm.addEventListener('submit', event => {
      event.preventDefault()
      this.applyConnectionSetting(this.connectionInput.value)
    })
    this.connectionReset.addEventListener('click', () => this.applyConnectionSetting(undefined))
    this.feedbackButton.addEventListener('click', () => void this.openFeedbackArchive())
    this.feedbackSummary.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-feedback-summary-category]')
      if (button) void this.openFeedbackArchive()
    })
    required(shadow, '[data-feedback-close]').addEventListener('click', () => this.closeFeedbackArchive())
    required(shadow, '[data-debug-clear]').addEventListener('click', () => this.clearDebugLog())
    this.messageInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        this.submit()
      }
    })
    this.messageInput.addEventListener('input', () => this.syncSubmitAvailability())
    this.messageInput.addEventListener('paste', event => this.handlePaste(event))
    required<HTMLButtonElement>(shadow, '[data-image-add]').addEventListener('click', () => this.imageInput.click())
    this.imageInput.addEventListener('change', () => this.handleImageSelection())
    this.attachmentPreviewClose.addEventListener('click', () => this.closeAttachmentPreview())
    this.attachmentPreview.addEventListener('click', event => {
      if ((event.target as HTMLElement).hasAttribute('data-preview-backdrop')) this.closeAttachmentPreview()
    })
    this.attachmentPreview.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeAttachmentPreview()
    })
    this.syncSubmitAvailability()
  }

  configure(options: AssistantWidgetMountOptions): void {
    this.authentication = options.authentication
    this.authenticated = options.authentication?.authenticated ?? true
    this.feedbackArchive = options.feedbackArchive
    this.conversationHistory = options.conversationHistory
    this.connectionSettings = options.connectionSettings
    this.syncConnectionSettings()
    this.feedbackButton.hidden = !this.feedbackArchive
    this.feedbackSummary.hidden = true
    this.syncAuthenticationView()
    if (this.feedbackArchive && this.authenticated) void this.refreshFeedbackSummary()
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
    this.releaseAllAttachmentPreviews()
    this.conversationViewport.destroy()
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
    this.closeAttachmentPreview(false)
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
    this.closeAttachmentPreview(false)
    this.panel.hidden = true
    this.launcher.hidden = true
    this.unlockLayer.hidden = true
    this.dispatchEvent(new CustomEvent('assistant-hidden', { bubbles: true }))
  }

  private selectMode(mode: AssistantMode): void {
    this.mode = mode
    this.modeLabel.textContent = modeLabels[mode]
  }

  setState(detail: AssistantWidgetState): void {
    if (detail.debugEntry) this.appendDebugEntry(detail.debugEntry)
    const authenticationFailure = Boolean(detail.authenticationRequired && this.authentication)
    if (authenticationFailure) {
      this.authenticated = false
      this.loginError.textContent = detail.message ?? '请重新登录 Forge 账号'
      this.loginError.hidden = false
      this.notice.hidden = true
      this.syncAuthenticationView()
    }
    if (detail.messages) this.renderConversation(detail.messages)
    if (detail.historyLoading !== undefined || detail.historyError !== undefined
        || detail.transcriptMissing !== undefined) {
      this.renderHistoryStatus(detail)
    }
    if (detail.feedbackArchiveChanged) void this.refreshFeedbackSummary()
    if (detail.submissionAccepted) this.releaseSubmittedAttachments()
    if (detail.failedSubmission) this.restoreFailedSubmission(detail.failedSubmission)
    if (detail.state) {
      if (detail.state === '正在载入页面会话') this.resetFeedbackArchiveForPageChange()
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
      if (detail.state === '已就绪' || detail.state === '已恢复' || detail.state === '已完成') {
        void this.refreshFeedbackSummary()
      }
    }
    if (detail.message && !authenticationFailure) {
      this.notice.textContent = detail.message
      this.notice.hidden = false
    } else if (authenticationFailure || detail.messages) {
      this.notice.hidden = true
    }
  }

  private submit(): void {
    if (this.interactionBusy) return
    const text = this.messageInput.value.trim()
    if (!text && this.attachments.length === 0) return
    const attachments = [...this.attachments]
    this.conversationMessages = [...this.conversationMessages, {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text || imageMessageLabel(attachments.length),
      timestamp: Date.now(),
      attachments: attachments.map(attachment => ({ ...attachment })),
    }]
    this.renderConversation(this.conversationMessages)
    this.messageInput.value = ''
    this.attachments = []
    this.submittedAttachments = attachments
    this.renderAttachments()
    this.setState({ state: '正在准备上下文' })
    this.dispatchEvent(new CustomEvent('assistant-submit', {
      detail: { mode: this.mode, text, ...(attachments.length > 0 ? { attachments } : {}) },
      bubbles: true,
    }))
  }

  private handlePaste(event: ClipboardEvent): void {
    if (!event.clipboardData) return
    const hasImages = [...event.clipboardData.items]
      .some(item => item.kind === 'file' && item.type.startsWith('image/'))
    if (!hasImages) return
    event.preventDefault()
    try {
      this.attachments = collectClipboardImages(event.clipboardData, this.attachments)
      const text = event.clipboardData.getData('text/plain')
      if (text) insertTextAtSelection(this.messageInput, text)
      this.notice.hidden = true
      this.renderAttachments()
      this.syncSubmitAvailability()
    } catch (error) {
      this.notice.textContent = error instanceof Error ? error.message : '图片粘贴失败'
      this.notice.hidden = false
    }
  }

  private handleImageSelection(): void {
    try {
      this.attachments = appendImageFiles(this.attachments, [...(this.imageInput.files ?? [])])
      this.notice.hidden = true
      this.renderAttachments()
      this.syncSubmitAvailability()
    } catch (error) {
      this.notice.textContent = error instanceof Error ? error.message : '图片添加失败'
      this.notice.hidden = false
    } finally {
      this.imageInput.value = ''
    }
  }

  private renderAttachments(): void {
    const fragment = document.createDocumentFragment()
    this.attachments.forEach(attachment => {
      const item = document.createElement('div')
      item.className = 'attachment'
      const preview = document.createElement('button')
      preview.className = 'attachment-preview-trigger'
      preview.type = 'button'
      preview.setAttribute('aria-label', `预览图片 ${attachment.name}`)
      const image = document.createElement('img')
      image.alt = ''
      image.src = this.previewUrl(attachment)
      preview.append(image)
      preview.addEventListener('click', () => this.openAttachmentPreview(attachment, preview))
      const info = document.createElement('span')
      info.className = 'attachment-info'
      const name = document.createElement('span')
      name.className = 'attachment-name'
      name.textContent = attachment.name
      const size = document.createElement('span')
      size.className = 'attachment-size'
      size.textContent = formatAttachmentSize(attachment.size)
      info.append(name, size)
      const remove = document.createElement('button')
      remove.className = 'attachment-remove'
      remove.type = 'button'
      remove.textContent = '移除'
      remove.setAttribute('aria-label', `移除图片 ${attachment.name}`)
      remove.addEventListener('click', () => this.removeAttachment(attachment.id))
      item.append(preview, info, remove)
      fragment.append(item)
    })
    this.attachmentList.replaceChildren(fragment)
    this.attachmentList.hidden = this.attachments.length === 0
  }

  private removeAttachment(id: string): void {
    this.attachments = this.attachments.filter(item => item.id !== id)
    this.releaseAttachmentPreview(id)
    this.renderAttachments()
    this.syncSubmitAvailability()
  }

  private openAttachmentPreview(attachment: AssistantImageAttachment, trigger: HTMLButtonElement): void {
    this.attachmentPreviewTrigger = trigger
    this.attachmentPreviewTitle.textContent = attachment.name
    this.attachmentPreviewImage.src = this.previewUrl(attachment)
    this.attachmentPreviewImage.alt = attachment.name
    this.attachmentPreview.hidden = false
    queueMicrotask(() => this.attachmentPreviewClose.focus())
  }

  private closeAttachmentPreview(restoreFocus = true): void {
    if (this.attachmentPreview.hidden) return
    this.attachmentPreview.hidden = true
    this.attachmentPreviewImage.removeAttribute('src')
    this.attachmentPreviewImage.alt = ''
    const trigger = this.attachmentPreviewTrigger
    this.attachmentPreviewTrigger = undefined
    if (restoreFocus && trigger?.isConnected) queueMicrotask(() => trigger.focus())
  }

  private restoreFailedSubmission(submission: import('./types').AssistantSubmission): void {
    this.messageInput.value = submission.text
    this.attachments = submission.attachments ? [...submission.attachments] : []
    this.submittedAttachments = []
    this.renderAttachments()
    this.syncSubmitAvailability()
    queueMicrotask(() => this.messageInput.focus())
  }

  private previewUrl(attachment: AssistantImageAttachment): string {
    const existing = this.attachmentPreviewUrls.get(attachment.id)
    if (existing) return existing
    const url = attachmentPreviewUrl(attachment)
    this.attachmentPreviewUrls.set(attachment.id, url)
    return url
  }

  private releaseSubmittedAttachments(): void {
    this.submittedAttachments = []
  }

  private releaseAttachmentPreview(id: string): void {
    const url = this.attachmentPreviewUrls.get(id)
    if (url) URL.revokeObjectURL(url)
    this.attachmentPreviewUrls.delete(id)
  }

  private releaseAllAttachmentPreviews(): void {
    this.attachmentPreviewUrls.forEach(url => URL.revokeObjectURL(url))
    this.attachmentPreviewUrls.clear()
    this.attachmentPreviewLoads.clear()
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
    if (opening) {
      this.syncConnectionSettings()
      this.connectionInput.focus()
    }
  }

  private syncConnectionSettings(): void {
    const settings = this.connectionSettings
    this.debugToggle.textContent = settings ? '连接' : '调试'
    this.connectionForm.hidden = !settings
    this.loginConnection.hidden = !settings
    if (!settings) return
    const effectiveRequestBaseUrl = settings.userRequestBaseUrl ?? settings.effectiveRequestBaseUrl
    this.connectionInput.value = effectiveRequestBaseUrl
    this.loginConnectionInput.value = effectiveRequestBaseUrl
    this.connectionDefault.textContent = `默认：${settings.defaultRequestBaseUrl}`
    this.loginConnectionDefault.textContent = `接入方默认：${settings.defaultRequestBaseUrl}`
    this.connectionReset.disabled = !settings.userRequestBaseUrl
    this.connectionError.hidden = true
    this.loginConnectionError.hidden = true
    this.connectionStatus.textContent = settings.userRequestBaseUrl ? '当前使用浏览器自定义地址' : '当前跟随接入方默认地址'
    this.loginConnectionStatus.textContent = settings.userRequestBaseUrl
      ? '当前使用浏览器自定义地址'
      : '当前跟随接入方默认地址'
  }

  private applyConnectionSetting(value?: string, source: 'panel' | 'login' = 'panel'): void {
    const settings = this.connectionSettings
    if (!settings) return
    const errorElement = source === 'login' ? this.loginConnectionError : this.connectionError
    const inputElement = source === 'login' ? this.loginConnectionInput : this.connectionInput
    errorElement.hidden = true
    let normalized: string | undefined
    try {
      normalized = value?.trim() ? validateAssistantUserRequestBaseUrl(value) : undefined
      settings.apply(normalized)
      const status = '地址已保存，正在重新载入并连接…'
      this.connectionStatus.textContent = status
      this.loginConnectionStatus.textContent = status
      this.connectionInput.disabled = true
      this.loginConnectionInput.disabled = true
      this.loginConnectionApply.disabled = true
      this.connectionReset.disabled = true
      this.connectionForm.querySelector<HTMLButtonElement>('[data-connection-submit]')!.disabled = true
    } catch (error) {
      errorElement.textContent = error instanceof Error ? error.message : String(error)
      errorElement.hidden = false
      inputElement.focus()
    }
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

  private async openFeedbackArchive(): Promise<void> {
    if (!this.feedbackArchive) return
    const contextVersion = this.feedbackContextVersion
    this.chatContent.hidden = true
    this.feedbackArchiveView.hidden = false
    this.feedbackArchiveBody.replaceChildren(statusText('正在加载会话记录…'))
    try {
      const page = await this.feedbackArchive.listSessions()
      if (contextVersion !== this.feedbackContextVersion) return
      this.feedbackSessions = page.items
      this.renderFeedbackSummary(page.items)
      this.activeFeedbackSession = undefined
      this.activeFeedbackCategory = undefined
      this.renderFeedbackSessions()
    } catch (error) {
      if (contextVersion !== this.feedbackContextVersion) return
      this.renderFeedbackError(error)
    }
  }

  private async refreshFeedbackSummary(): Promise<void> {
    if (!this.feedbackArchive || !this.authenticated) {
      this.feedbackSummary.hidden = true
      return
    }
    const contextVersion = this.feedbackContextVersion
    try {
      const page = await this.feedbackArchive.listSessions()
      if (contextVersion !== this.feedbackContextVersion) return
      this.feedbackSessions = page.items
      this.renderFeedbackSummary(page.items)
    } catch {
      if (contextVersion !== this.feedbackContextVersion) return
      this.feedbackSummary.hidden = true
    }
  }

  private renderFeedbackSummary(sessions: AssistantFeedbackSession[]): void {
    const counts = summarizeFeedbackCounts(sessions)
    for (const category of feedbackCategories) {
      const button = this.feedbackSummary.querySelector<HTMLButtonElement>(
        `[data-feedback-summary-category="${category.code}"]`)
      if (button) button.textContent = `${category.label} ${counts[category.countKey]}`
    }
    this.feedbackSummary.hidden = false
  }

  private closeFeedbackArchive(): void {
    this.feedbackArchiveView.hidden = true
    this.chatContent.hidden = false
    this.activeFeedbackSession = undefined
    this.activeFeedbackCategory = undefined
  }

  private resetFeedbackArchiveForPageChange(): void {
    this.conversationContextVersion += 1
    this.releaseAllAttachmentPreviews()
    this.feedbackContextVersion += 1
    this.feedbackSessions = []
    this.feedbackSummary.hidden = true
    this.feedbackArchiveBody.replaceChildren(statusText('正在载入当前页面记录…'))
    this.closeFeedbackArchive()
  }

  private renderFeedbackSessions(): void {
    const fragment = document.createDocumentFragment()
    const intro = document.createElement('p')
    intro.className = 'feedback-intro'
    intro.textContent = '按会话回顾自动识别的 Bug、优化建议和需求。'
    fragment.append(intro)
    if (this.feedbackSessions.length === 0) {
      fragment.append(statusText('暂无已归档的反馈记录。'))
    }
    for (const session of this.feedbackSessions) {
      const row = document.createElement('article')
      row.className = 'feedback-session'
      const title = document.createElement('h4')
      title.textContent = session.title || '未命名咨询会话'
      const time = document.createElement('time')
      time.textContent = new Date(session.lastSeenAt).toLocaleString()
      const tags = document.createElement('div')
      tags.className = 'feedback-tags'
      for (const category of feedbackCategories) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'feedback-tag'
        button.textContent = `${category.label} ${session.counts[category.countKey]}`
        button.addEventListener('click', () => void this.openFeedbackCategory(session, category.code))
        tags.append(button)
      }
      row.append(title, time, tags)
      fragment.append(row)
    }
    this.feedbackArchiveBody.replaceChildren(fragment)
  }

  private async openFeedbackCategory(session: AssistantFeedbackSession,
    category: AssistantFeedbackCategory): Promise<void> {
    if (!this.feedbackArchive) return
    this.activeFeedbackSession = session
    this.activeFeedbackCategory = category
    this.feedbackArchiveBody.replaceChildren(statusText('正在加载反馈记录…'))
    try {
      const page = await this.feedbackArchive.listCandidates(session.id, category)
      this.feedbackCandidates = page.items
      this.renderFeedbackCandidates()
    } catch (error) {
      this.renderFeedbackError(error)
    }
  }

  private renderFeedbackCandidates(): void {
    const session = this.activeFeedbackSession
    const category = this.activeFeedbackCategory
    if (!session || !category) return
    const fragment = document.createDocumentFragment()
    const toolbar = document.createElement('div')
    toolbar.className = 'feedback-toolbar'
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'feedback-link'
    back.textContent = '← 全部会话'
    back.addEventListener('click', () => this.renderFeedbackSessions())
    const heading = document.createElement('strong')
    heading.textContent = `${session.title || '未命名咨询会话'} · ${feedbackLabel(category)}`
    toolbar.append(back, heading)
    fragment.append(toolbar)
    if (this.feedbackCandidates.length === 0) fragment.append(statusText('该标签下暂无记录。'))
    this.feedbackCandidates.forEach(candidate => fragment.append(this.feedbackCandidateCard(candidate)))
    this.feedbackArchiveBody.replaceChildren(fragment)
  }

  private feedbackCandidateCard(candidate: AssistantFeedbackCandidate): HTMLElement {
    const card = document.createElement('article')
    card.className = 'feedback-card'
    const meta = document.createElement('div')
    meta.className = 'feedback-card-meta'
    const tag = document.createElement('span')
    tag.className = 'feedback-tag-static'
    tag.textContent = feedbackLabel(candidate.category)
    const time = document.createElement('time')
    time.textContent = new Date(candidate.detectedAt).toLocaleString()
    meta.append(tag, time)
    const content = document.createElement('div')
    content.className = 'feedback-content'
    content.innerHTML = DOMPurify.sanitize(
      marked.parse(candidate.content, { async: false, breaks: true }) as string).trim()
    const actions = document.createElement('div')
    actions.className = 'feedback-card-actions'
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'feedback-link'
    edit.textContent = '编辑'
    edit.addEventListener('click', () => this.editFeedbackCandidate(card, candidate))
    const revisions = document.createElement('button')
    revisions.type = 'button'
    revisions.className = 'feedback-link'
    revisions.textContent = '修订记录'
    revisions.addEventListener('click', () => void this.showFeedbackRevisions(card, candidate))
    actions.append(edit, revisions)
    if (candidate.attachments.length > 0) {
      const files = document.createElement('div')
      files.className = 'feedback-files'
      candidate.attachments.forEach(attachment => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'feedback-file'
        button.textContent = `图片 · ${attachment.name}`
        button.addEventListener('click', () => void this.previewArchivedAttachment(candidate, attachment, button))
        files.append(button)
      })
      card.append(meta, content, files, actions)
    } else {
      card.append(meta, content, actions)
    }
    if (candidate.sourceContent) card.append(this.originalSourceFeedback(candidate.sourceContent))
    if (candidate.aiOriginal) card.append(this.originalFeedback(candidate.aiOriginal.content))
    return card
  }

  private editFeedbackCandidate(card: HTMLElement, candidate: AssistantFeedbackCandidate): void {
    const form = document.createElement('form')
    form.className = 'feedback-edit'
    const select = document.createElement('select')
    feedbackCategories.forEach(category => select.add(new Option(category.label, category.code)))
    select.value = candidate.category
    const textarea = document.createElement('textarea')
    textarea.value = candidate.content
    textarea.maxLength = 8000
    const controls = document.createElement('div')
    controls.className = 'feedback-card-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'feedback-link'
    cancel.textContent = '取消'
    cancel.addEventListener('click', () => this.renderFeedbackCandidates())
    const save = document.createElement('button')
    save.type = 'submit'
    save.className = 'submit'
    save.textContent = '保存修正'
    controls.append(cancel, save)
    form.append(select, textarea, controls)
    form.addEventListener('submit', event => {
      event.preventDefault()
      void this.saveFeedbackCandidate(candidate, select.value as AssistantFeedbackCategory,
        textarea.value, save)
    })
    card.replaceChildren(form)
    textarea.focus()
  }

  private async saveFeedbackCandidate(candidate: AssistantFeedbackCandidate,
    category: AssistantFeedbackCategory, content: string, button: HTMLButtonElement): Promise<void> {
    if (!this.feedbackArchive || !this.activeFeedbackSession) return
    if (!content.trim()) return
    button.disabled = true
    try {
      const updated = await this.feedbackArchive.updateCandidate(this.activeFeedbackSession.id, candidate, {
        category, content: content.trim(), requirementType: requirementType(category),
      })
      this.feedbackCandidates = category === this.activeFeedbackCategory
        ? this.feedbackCandidates.map(item => item.id === updated.id ? updated : item)
        : this.feedbackCandidates.filter(item => item.id !== updated.id)
      this.renderFeedbackCandidates()
      const session = this.feedbackSessions.find(item => item.id === this.activeFeedbackSession?.id)
      if (session && category !== candidate.category) {
        session.counts[feedbackCountKey(candidate.category)] -= 1
        session.counts[feedbackCountKey(category)] += 1
        this.renderFeedbackSummary(this.feedbackSessions)
      }
    } catch (error) {
      button.disabled = false
      this.notice.textContent = error instanceof Error ? error.message : '反馈修正保存失败'
      this.notice.hidden = false
    }
  }

  private async showFeedbackRevisions(card: HTMLElement, candidate: AssistantFeedbackCandidate): Promise<void> {
    if (!this.feedbackArchive || !this.activeFeedbackSession) return
    try {
      const page = await this.feedbackArchive.listRevisions(this.activeFeedbackSession.id, candidate.id)
      const details = document.createElement('details')
      details.className = 'feedback-revisions'
      details.open = true
      const summary = document.createElement('summary')
      summary.textContent = `修订记录 ${page.items.length}`
      details.append(summary)
      page.items.forEach(revision => {
        const item = document.createElement('p')
        item.textContent = `${revision.source === 'AI' ? 'AI 原始' : '用户修正'} · ${feedbackLabel(revision.category)} · ${revision.content}`
        details.append(item)
      })
      card.querySelector('.feedback-revisions')?.remove()
      card.append(details)
    } catch (error) {
      this.renderFeedbackError(error)
    }
  }

  private originalFeedback(content: string): HTMLElement {
    const details = document.createElement('details')
    details.className = 'feedback-original'
    const summary = document.createElement('summary')
    summary.textContent = '查看 AI 原始识别'
    const text = document.createElement('div')
    text.innerHTML = DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }) as string)
    details.append(summary, text)
    return details
  }

  private originalSourceFeedback(content: string): HTMLElement {
    const details = document.createElement('details')
    details.className = 'feedback-original'
    const summary = document.createElement('summary')
    summary.textContent = '查看用户原始描述'
    const text = document.createElement('p')
    text.textContent = content
    details.append(summary, text)
    return details
  }

  private async previewArchivedAttachment(candidate: AssistantFeedbackCandidate,
    attachment: import('./types').AssistantFeedbackAttachment, trigger: HTMLButtonElement): Promise<void> {
    if (!this.feedbackArchive || !this.activeFeedbackSession) return
    try {
      const blob = await this.feedbackArchive.loadAttachment(
        this.activeFeedbackSession.id, candidate.id, attachment.id)
      const key = `archive-${attachment.id}`
      this.releaseAttachmentPreview(key)
      const url = URL.createObjectURL(blob)
      this.attachmentPreviewUrls.set(key, url)
      this.attachmentPreviewTrigger = trigger
      this.attachmentPreviewTitle.textContent = attachment.name
      this.attachmentPreviewImage.src = url
      this.attachmentPreviewImage.alt = attachment.name
      this.attachmentPreview.hidden = false
      queueMicrotask(() => this.attachmentPreviewClose.focus())
    } catch (error) {
      this.notice.textContent = error instanceof Error ? error.message : '归档图片暂时无法加载'
      this.notice.hidden = false
    }
  }

  private renderFeedbackError(error: unknown): void {
    const message = statusText(error instanceof Error ? error.message : '反馈归档暂时无法加载')
    message.classList.add('feedback-error')
    this.feedbackArchiveBody.replaceChildren(message)
  }

  private async submitLogin(): Promise<void> {
    if (!this.authentication || this.authenticating) return
    if (this.hasPendingLoginConnectionChange()) return
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
      void this.refreshFeedbackSummary()
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

  private hasPendingLoginConnectionChange(): boolean {
    const settings = this.connectionSettings
    if (!settings) return false
    try {
      const normalized = validateAssistantUserRequestBaseUrl(this.loginConnectionInput.value)
      if (normalized === settings.effectiveRequestBaseUrl) return false
      this.loginConnectionError.textContent = '连接地址已修改，请先应用并重新连接，再登录 Forge。'
      this.loginConnectionError.hidden = false
      this.loginConnectionApply.focus()
      return true
    } catch (error) {
      this.loginConnectionError.textContent = error instanceof Error ? error.message : String(error)
      this.loginConnectionError.hidden = false
      this.loginConnectionInput.focus()
      return true
    }
  }

  private syncAuthenticationView(): void {
    const authenticationRequired = Boolean(this.authentication) && !this.authenticated
    this.authenticationPanel.hidden = !authenticationRequired
    this.authenticatedContent.hidden = authenticationRequired
    if (authenticationRequired) this.feedbackSummary.hidden = true
  }

  private renderConversation(messages: AssistantConversationMessage[]): void {
    const shouldStickToBottom = this.conversation.scrollHeight - this.conversation.scrollTop
      <= this.conversation.clientHeight + 80
    this.conversationMessages = messages.map(message => ({ ...message }))
    this.conversationViewport.setMessages(this.conversationMessages, shouldStickToBottom)
    this.syncConversationVisibility()
  }

  private renderHistoryStatus(state: AssistantWidgetState): void {
    this.historyStatus.replaceChildren()
    if (state.historyLoading) {
      this.historyStatus.textContent = '正在载入会话记录…'
      this.historyStatus.hidden = false
      return
    }
    if (state.historyError) {
      const text = document.createElement('span')
      text.textContent = state.historyError
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.textContent = '重试'
      retry.addEventListener('click', () => this.conversationHistory?.loadEarlier())
      this.historyStatus.append(text, retry)
      this.historyStatus.hidden = false
      return
    }
    if (state.transcriptMissing) {
      this.historyStatus.textContent = '较早的会话记录已不可用，你仍可从当前页面继续提问。'
      this.historyStatus.hidden = false
      return
    }
    this.historyStatus.hidden = true
  }

  private syncSubmitAvailability(): void {
    const hasMessage = this.messageInput.value.trim().length > 0 || this.attachments.length > 0
    this.submitButton.disabled = this.interactionBusy || !hasMessage
    this.submitButton.title = this.interactionBusy
      ? '当前回合处理中，完成后可继续发送'
      : hasMessage ? '发送消息或图片' : '请输入消息或粘贴图片'
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
    if (message.attachments?.length) article.append(this.renderMessageAttachments(message.attachments))
    if (message.streaming) {
      const streaming = document.createElement('span')
      streaming.className = 'streaming'
      streaming.textContent = '正在生成'
      article.append(streaming)
    }
    return article
  }

  private renderMessageAttachments(attachments: AssistantConversationAttachment[]): HTMLElement {
    const list = document.createElement('div')
    list.className = 'message-attachments'
    attachments.forEach(attachment => {
      list.append(attachment.mime.startsWith('image/')
        ? this.renderMessageImage(attachment)
        : this.renderMessageFile(attachment))
    })
    return list
  }

  private renderMessageImage(attachment: AssistantConversationAttachment): HTMLButtonElement {
    const trigger = document.createElement('button')
    trigger.className = 'message-image'
    trigger.type = 'button'
    trigger.setAttribute('aria-label', `预览图片 ${attachment.name}`)
    const image = document.createElement('img')
    image.alt = attachment.name
    const caption = document.createElement('span')
    caption.textContent = attachment.name
    trigger.append(image, caption)
    void this.resolveMessageAttachmentUrl(attachment).then(url => {
      image.src = url
      trigger.addEventListener('click', () => this.openResolvedAttachmentPreview(
        attachment.name, url, trigger))
    }).catch(() => {
      trigger.disabled = true
      caption.textContent = `${attachment.name} · 无法加载`
    })
    return trigger
  }

  private renderMessageFile(attachment: AssistantConversationAttachment): HTMLButtonElement {
    const trigger = document.createElement('button')
    trigger.className = 'message-file'
    trigger.type = 'button'
    trigger.title = attachment.name
    const icon = document.createElement('span')
    icon.className = 'message-file-icon'
    icon.setAttribute('aria-hidden', 'true')
    const name = document.createElement('span')
    name.textContent = attachment.name
    trigger.append(icon, name)
    if (this.conversationHistory?.loadAttachment) {
      trigger.addEventListener('click', () => void this.downloadMessageAttachment(attachment, trigger))
    } else {
      trigger.disabled = true
    }
    return trigger
  }

  private async resolveMessageAttachmentUrl(attachment: AssistantConversationAttachment): Promise<string> {
    if (attachment.file) return this.previewUrl(attachment as AssistantImageAttachment)
    const key = `conversation-${attachment.id}`
    const existing = this.attachmentPreviewUrls.get(key)
    if (existing) return existing
    const loading = this.attachmentPreviewLoads.get(key)
    if (loading) return loading
    if (!this.conversationHistory?.loadAttachment) throw new Error('附件读取能力不可用')
    const contextVersion = this.conversationContextVersion
    const request = this.conversationHistory.loadAttachment(attachment.id).then(blob => {
      const url = URL.createObjectURL(blob)
      if (contextVersion !== this.conversationContextVersion) {
        URL.revokeObjectURL(url)
        throw new Error('页面会话已切换')
      }
      this.attachmentPreviewUrls.set(key, url)
      return url
    }).finally(() => this.attachmentPreviewLoads.delete(key))
    this.attachmentPreviewLoads.set(key, request)
    return request
  }

  private openResolvedAttachmentPreview(name: string, url: string, trigger: HTMLButtonElement): void {
    this.attachmentPreviewTrigger = trigger
    this.attachmentPreviewTitle.textContent = name
    this.attachmentPreviewImage.src = url
    this.attachmentPreviewImage.alt = name
    this.attachmentPreview.hidden = false
    queueMicrotask(() => this.attachmentPreviewClose.focus())
  }

  private async downloadMessageAttachment(
    attachment: AssistantConversationAttachment,
    trigger: HTMLButtonElement,
  ): Promise<void> {
    trigger.disabled = true
    try {
      const url = await this.resolveMessageAttachmentUrl(attachment)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachment.name
      anchor.click()
    } finally {
      trigger.disabled = false
    }
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

const feedbackCategories = [
  { code: 'BUG', label: 'Bug', countKey: 'bug' },
  { code: 'OPTIMIZATION', label: '优化建议', countKey: 'optimization' },
  { code: 'REQUIREMENT', label: '需求', countKey: 'requirement' },
] as const

function feedbackLabel(category: AssistantFeedbackCategory): string {
  return feedbackCategories.find(item => item.code === category)?.label ?? category
}

function feedbackCountKey(category: AssistantFeedbackCategory): keyof import('./types').AssistantFeedbackCounts {
  return feedbackCategories.find(item => item.code === category)?.countKey ?? 'requirement'
}

function requirementType(category: AssistantFeedbackCategory): string {
  if (category === 'BUG') return 'BUG_FIX'
  if (category === 'OPTIMIZATION') return 'MODULE_ADJUST'
  return 'NEW_MODULE'
}

function statusText(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p')
  paragraph.className = 'feedback-status'
  paragraph.textContent = text
  return paragraph
}

function insertTextAtSelection(input: HTMLTextAreaElement, text: string): void {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  input.setRangeText(text, start, end, 'end')
}

function imageMessageLabel(count: number): string {
  return count === 1 ? '[图片]' : `[${count} 张图片]`
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
    .launcher:focus-visible, .action:focus-visible, .close:focus-visible, .submit:focus-visible, .panel-header:focus-visible, .image-add:focus-visible, .attachment-preview-trigger:focus-visible, .attachment-preview-close:focus-visible, .feedback-summary-tag:focus-visible, textarea:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
    .panel { position: fixed; top: 16px; right: 16px; z-index: 2147483001; width: min(560px, calc(100vw - 32px)); height: min(760px, calc(100vh - 32px)); background: #f7f7f8; border: 1px solid #dedee3; border-radius: 10px; box-shadow: 0 20px 48px rgb(0 0 0 / 12%); overflow: hidden; }
    .shell { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; }
    .assistant-content, .chat-content { display: flex; min-width: 0; min-height: 0; height: 100%; flex-direction: column; overflow: hidden; }
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
    .login-connection { margin: 0 0 20px; padding: 0 0 20px; border-bottom: 1px solid #ececf0; }
    .login-connection label { display: grid; gap: 6px; color: #3f3f46; font-size: 12px; font-weight: 600; }
    .login-connection input { min-height: 42px; width: 100%; border: 1px solid #cfcfd5; border-radius: 7px; padding: 0 11px; color: #18181b; }
    .login-connection-meta { margin: 8px 0 0 !important; color: #71717a; font-size: 11px; line-height: 1.55; overflow-wrap: anywhere; }
    .login-connection-actions { display: flex; justify-content: flex-end; margin-top: 10px; }
    .login-connection-actions button { min-height: 36px; }
    .login-connection-error { margin: 8px 0 0 !important; color: #b91c1c !important; font-size: 11px; overflow-wrap: anywhere; }
    .login-error { margin: 10px 0 0 !important; overflow-wrap: anywhere; color: #b91c1c !important; }
    .login-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
    .action { flex: 0 0 auto; min-height: 34px; padding: 0 10px; border: 1px solid #d4d4d8; border-radius: 7px; background: #fff; color: #52525b; cursor: pointer; }
    .action:hover { border-color: #a1a1aa; color: #18181b; }
    .context-strip { display: grid; min-height: 48px; flex: 0 0 auto; gap: 6px; padding: 9px 22px; border-bottom: 1px solid #e4e4e7; background: #fafafa; }
    .context-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .context { margin: 0; color: #71717a; font-size: 12px; }
    .mode { margin: 0; color: #18181b; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .feedback-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; color: #71717a; font-size: 11px; }
    .feedback-summary-label { margin-right: 2px; }
    .feedback-summary-tag { min-height: 24px; border: 0; border-bottom: 1px solid transparent; background: transparent; padding: 0 2px; color: #3f3f46; cursor: pointer; font-size: 11px; }
    .feedback-summary-tag:hover { border-bottom-color: #a1a1aa; color: #18181b; }
    .debug-panel { max-height: min(360px, 52vh); overflow: auto; border-bottom: 1px solid #dedee3; background: #fff; }
    .connection-form { display: grid; gap: 10px; padding: 16px 22px; }
    .connection-form label { display: grid; gap: 6px; color: #3f3f46; font-size: 12px; font-weight: 650; }
    .connection-form input { min-height: 40px; width: 100%; border: 1px solid #cfcfd5; border-radius: 7px; padding: 0 10px; color: #18181b; }
    .connection-copy { display: grid; gap: 3px; }
    .connection-copy p { margin: 0; overflow-wrap: anywhere; color: #71717a; font-size: 11px; line-height: 1.5; }
    .connection-error { color: #b91c1c !important; }
    .connection-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .connection-actions div { display: flex; gap: 8px; }
    .connection-status { color: #52525b; font-size: 11px; }
    .connection-log { border-top: 1px solid #e4e4e7; background: #18181b; color: #d4d4d8; }
    .connection-log summary { min-height: 38px; padding: 11px 22px; color: #d4d4d8; cursor: pointer; font-size: 11px; }
    .debug-header { display: flex; align-items: center; justify-content: space-between; padding: 7px 22px 6px; color: #a1a1aa; font-size: 11px; }
    .debug-clear { border: 0; background: transparent; color: #a1a1aa; cursor: pointer; font-size: 11px; }
    .debug-clear:hover { color: #fff; }
    .debug-list { max-height: 154px; margin: 0; overflow: auto; padding: 0 22px 12px; list-style: none; font: 11px/1.55 "SFMono-Regular", Consolas, monospace; }
    .debug-row { display: grid; grid-template-columns: 66px minmax(120px, auto) minmax(0, 1fr); gap: 8px; padding: 3px 0; border-top: 1px solid rgb(255 255 255 / 7%); }
    .debug-row time { color: #71717a; }
    .debug-row code { overflow-wrap: anywhere; color: #a5b4fc; }
    .empty { flex: 1 1 auto; align-self: stretch; padding: 40px 36px; text-align: center; }
    .empty h3 { margin: 0 0 8px; font-size: 17px; font-weight: 650; }
    .empty p { max-width: 34em; margin: 0 auto; color: #71717a; }
    .conversation { min-width: 0; min-height: 0; max-width: 100%; flex: 1 1 auto; overflow: auto; padding: 22px; overscroll-behavior: contain; overflow-anchor: none; }
    .history-status { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 28px; margin: 0 0 12px; color: #71717a; font-size: 12px; }
    .history-status button { border: 0; border-bottom: 1px solid currentColor; background: transparent; color: #3f3f46; cursor: pointer; font: inherit; }
    .history-status button:focus-visible { outline: 2px solid #4f46e5; outline-offset: 3px; }
    .activity { display: flex; align-items: center; gap: 9px; min-height: 28px; margin: 2px 4px 16px; color: #52525b; font-size: 12px; font-weight: 600; }
    .activity::before { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: #4f46e5; content: ""; animation: pulse 1.2s ease-in-out infinite; }
    .activity[data-tone="warning"]::before { background: #f59e0b; animation: none; }
    .activity[data-tone="error"] { color: #b91c1c; }
    .activity[data-tone="error"]::before { background: #ef4444; animation: none; }
    .message { width: fit-content; max-width: 88%; margin: 0 0 18px; }
    .message.user { margin-left: auto; }
    .message.assistant { width: 100%; max-width: 100%; margin-right: auto; }
    .message-meta { margin: 0 4px 6px; color: #71717a; font-size: 11px; font-weight: 650; }
    .user .message-meta { text-align: right; }
    .message-body { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
    .user .message-body { padding: 10px 13px; border: 1px solid #d4d4d8; border-radius: 12px 12px 3px 12px; background: #fff; white-space: pre-wrap; }
    .message-attachments { display: grid; grid-template-columns: repeat(2, minmax(0, 112px)); justify-content: end; gap: 8px; margin: 8px 0 0; }
    .message-image { position: relative; display: block; width: 112px; height: 80px; overflow: hidden; border: 1px solid #d4d4d8; border-radius: 8px; background: #f4f4f5; padding: 0; cursor: zoom-in; }
    .message-image:hover { border-color: #a1a1aa; }
    .message-image:focus-visible, .message-file:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
    .message-image img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .message-image span { position: absolute; right: 0; bottom: 0; left: 0; overflow: hidden; background: rgb(24 24 27 / 72%); padding: 4px 6px; color: #fff; font-size: 11px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
    .message-file { display: flex; width: 224px; max-width: 100%; min-height: 40px; align-items: center; gap: 8px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fafafa; padding: 8px 10px; color: #3f3f46; cursor: pointer; font: inherit; text-align: left; }
    .message-file:hover { border-color: #a1a1aa; background: #f4f4f5; }
    .message-file:disabled { cursor: default; opacity: .65; }
    .message-file > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .message-file-icon { position: relative; width: 14px; height: 17px; flex: 0 0 auto; border: 1.5px solid currentColor; border-radius: 2px; }
    .message-file-icon::after { position: absolute; top: -2px; right: -2px; width: 5px; height: 5px; border-bottom: 1.5px solid currentColor; border-left: 1.5px solid currentColor; background: #fafafa; content: ""; }
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
    .assistant table { display: block; width: 100%; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: 12px; }
    .assistant th, .assistant td { border-bottom: 1px solid #dedee3; padding: 7px 8px; text-align: left; }
    .streaming { display: inline-flex; align-items: center; gap: 6px; margin: 6px 4px 0; color: #4f46e5; font-size: 11px; font-weight: 600; }
    .streaming::before { width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ""; animation: pulse 1.2s ease-in-out infinite; }
    .composer { flex: 0 0 auto; border-top: 1px solid #dedee3; background: #fff; padding: 14px 22px 12px; }
    .composer-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; color: #52525b; font-size: 12px; font-weight: 600; }
    .composer-tools { display: flex; align-items: center; gap: 12px; }
    .image-add { min-height: 32px; border: 0; background: transparent; padding: 0 4px; color: #52525b; cursor: pointer; font: inherit; }
    .image-add:hover { color: #18181b; }
    textarea { display: block; width: 100%; min-height: 82px; max-height: 180px; resize: vertical; border: 1px solid #cfcfd5; border-radius: 9px; background: #fff; padding: 11px 12px; color: inherit; line-height: 1.5; }
    textarea::placeholder { color: #a1a1aa; }
    .attachment-list { display: grid; max-height: 122px; gap: 6px; margin-bottom: 8px; overflow: auto; }
    .attachment { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 48px; border-bottom: 1px solid #eeeeef; padding: 2px 0 7px; }
    .attachment-preview-trigger { display: block; width: 44px; height: 44px; overflow: hidden; border: 1px solid #e4e4e7; border-radius: 6px; background: #f4f4f5; padding: 0; cursor: zoom-in; }
    .attachment-preview-trigger:hover { border-color: #a1a1aa; }
    .attachment-preview-trigger img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .attachment-info { display: grid; min-width: 0; }
    .attachment-name { overflow: hidden; color: #3f3f46; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .attachment-size { color: #a1a1aa; font-size: 11px; }
    .attachment-remove { min-height: 30px; border: 0; background: transparent; color: #71717a; cursor: pointer; font-size: 11px; }
    .attachment-remove:hover { color: #b91c1c; }
    .attachment-preview { position: absolute; inset: 0; z-index: 3; display: grid; grid-template-rows: auto minmax(0, 1fr); background: rgb(24 24 27 / 94%); color: #fff; }
    .attachment-preview-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 56px; border-bottom: 1px solid rgb(255 255 255 / 12%); padding: 8px 16px; }
    .attachment-preview-title { min-width: 0; margin: 0; overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .attachment-preview-close { min-width: 48px; min-height: 36px; border: 1px solid rgb(255 255 255 / 18%); border-radius: 7px; background: transparent; color: #f4f4f5; cursor: pointer; }
    .attachment-preview-close:hover { background: rgb(255 255 255 / 10%); }
    .attachment-preview-body { display: grid; min-width: 0; min-height: 0; place-items: center; padding: 16px; cursor: zoom-out; }
    .attachment-preview-image { display: block; max-width: 100%; max-height: 100%; border-radius: 6px; object-fit: contain; cursor: default; }
    .composer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 9px; }
    .submit { min-height: 36px; padding: 0 15px; border: 1px solid #18181b; border-radius: 7px; background: #18181b; color: #fff; cursor: pointer; }
    .submit:hover { background: #27272a; }
    .submit:disabled { cursor: not-allowed; opacity: .45; }
    .interrupt { min-height: 36px; padding: 0 13px; border: 1px solid #fecaca; border-radius: 7px; background: #fff; color: #b91c1c; cursor: pointer; }
    .interrupt:hover { background: #fef2f2; }
    .interrupt:disabled { cursor: wait; opacity: .55; }
    .notice { max-height: 96px; margin: 0 22px 10px; overflow: auto; border: 1px solid #fde68a; border-radius: 7px; background: #fffbeb; padding: 8px 10px; color: #854d0e; font-size: 12px; }
    select { min-height: 34px; min-width: 160px; max-width: 220px; border: 1px solid #d4d4d8; border-radius: 7px; background: #fff; padding: 0 8px; color: inherit; }
    footer { display: flex; flex: 0 0 auto; justify-content: space-between; gap: 12px; padding: 10px 22px 13px; border-top: 1px solid #eeeeef; background: #fff; color: #71717a; font-size: 11px; }
    .feedback-archive { min-width: 0; min-height: 0; height: 100%; overflow: auto; background: #fafafa; }
    .feedback-archive-header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; min-height: 52px; border-bottom: 1px solid #e4e4e7; background: rgb(255 255 255 / 96%); padding: 0 22px; }
    .feedback-archive-header h3 { margin: 0; font-size: 15px; }
    .feedback-archive-body { display: grid; gap: 1px; padding: 0 22px 28px; }
    .feedback-intro, .feedback-status { margin: 0; padding: 22px 0; color: #71717a; font-size: 13px; }
    .feedback-error { color: #b91c1c; }
    .feedback-session { display: grid; gap: 5px; border-top: 1px solid #e4e4e7; padding: 16px 0; }
    .feedback-session h4 { margin: 0; font-size: 14px; font-weight: 650; }
    .feedback-session time, .feedback-card time { color: #a1a1aa; font-size: 11px; }
    .feedback-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 6px; }
    .feedback-tag, .feedback-file { min-height: 32px; border: 1px solid #d4d4d8; border-radius: 999px; background: #fff; padding: 0 11px; color: #3f3f46; cursor: pointer; font-size: 12px; }
    .feedback-tag:hover, .feedback-file:hover { border-color: #a1a1aa; background: #f4f4f5; }
    .feedback-toolbar { display: grid; gap: 8px; border-bottom: 1px solid #e4e4e7; padding: 17px 0; }
    .feedback-link { width: fit-content; min-height: 28px; border: 0; background: transparent; padding: 0; color: #52525b; cursor: pointer; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
    .feedback-card { display: grid; gap: 11px; border-bottom: 1px solid #e4e4e7; padding: 18px 0; }
    .feedback-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .feedback-tag-static { border: 1px solid #d4d4d8; border-radius: 999px; background: #fff; padding: 4px 9px; font-size: 11px; font-weight: 650; }
    .feedback-content { margin: 0; color: #27272a; font-size: 13px; line-height: 1.7; }
    .feedback-content h2 { margin: 12px 0 4px; font-size: 13px; font-weight: 650; }
    .feedback-content h2:first-child { margin-top: 0; }
    .feedback-content p, .feedback-content ul, .feedback-content ol { margin: 0 0 8px; }
    .feedback-content ul, .feedback-content ol { padding-left: 20px; }
    .feedback-card-actions, .feedback-files { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
    .feedback-edit { display: grid; gap: 10px; }
    .feedback-edit textarea { min-height: 130px; resize: vertical; }
    .feedback-original, .feedback-revisions { color: #52525b; font-size: 12px; }
    .feedback-original summary, .feedback-revisions summary { cursor: pointer; }
    .feedback-original p, .feedback-original div, .feedback-revisions p { margin: 8px 0 0; white-space: pre-wrap; }
    @media (max-width: 620px) {
      .panel { inset: 0 !important; width: auto; height: auto; border: 0; border-radius: 0; }
      .panel-header { min-height: 64px; padding: 12px 8px 12px 16px; cursor: default; touch-action: auto; }
      .close { min-width: 40px; padding: 0 6px; }
      .context-strip { gap: 6px; padding: 8px 16px; }
      .connection-form { padding: 16px; }
      .connection-actions { align-items: stretch; flex-direction: column; }
      .connection-actions div { justify-content: flex-end; }
      .connection-log summary, .debug-header { padding-inline: 16px; }
      .debug-list { padding-inline: 16px; }
      .context-line { align-items: flex-start; flex-direction: column; gap: 3px; }
      .mode { white-space: normal; }
      .composer { padding-inline: 16px; }
      .composer-label { gap: 12px; }
      .composer-shortcut { display: none; }
      .image-add { min-height: 44px; padding: 0 8px; }
      footer { flex-wrap: wrap; padding-inline: 16px; }
      .launcher { right: 16px; bottom: 16px; }
      .message { max-width: 94%; }
      .feedback-archive-header, .feedback-archive-body { padding-inline: 16px; }
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
          <button class="close" type="button" data-feedback-open>记录</button>
          <button class="close" type="button" data-debug-toggle aria-expanded="false" aria-controls="assistant-debug-panel">连接</button>
          <button class="close" type="button" data-reset-position>复位</button>
          <button class="close" type="button" data-hide-assistant>隐藏</button>
          <button class="close" type="button" data-close aria-label="关闭对话框">关闭</button>
        </div>
      </header>
      <section class="authentication" data-authentication hidden>
        <form class="login-form" data-login-form>
          <h3>登录 Forge 后开始咨询</h3>
          <p>密码只用于本次验证；短期登录状态保留在当前标签页，刷新后可继续使用。</p>
          <div class="login-connection" data-login-connection hidden>
            <label>Forge 连接地址<input type="url" inputmode="url" spellcheck="false" data-login-connection-input autocomplete="url" /></label>
            <p class="login-connection-meta" data-login-connection-default></p>
            <p class="login-connection-meta" data-login-connection-status>当前跟随接入方默认地址</p>
            <p class="login-connection-error" data-login-connection-error role="alert" hidden></p>
            <div class="login-connection-actions"><button class="action" type="button" data-login-connection-apply>应用并重新连接</button></div>
          </div>
          <div class="login-fields">
            <label>Forge 账号<input type="text" data-login-username autocomplete="username" /></label>
            <label>密码<input type="password" data-login-password autocomplete="current-password" /></label>
          </div>
          <p class="login-error" data-login-error role="alert" hidden></p>
          <div class="login-actions"><button class="submit" type="submit" data-login-submit>登录并继续</button></div>
        </form>
      </section>
      <div class="assistant-content" data-authenticated-content>
      <div class="chat-content" data-chat-content>
      <section class="context-strip" data-context-strip aria-label="当前上下文与模式">
        <div class="context-line"><p class="context">当前页面 · 发送时采集脱敏上下文</p><p class="mode" data-mode-label>自动识别</p></div>
        <div class="feedback-summary" data-feedback-summary aria-label="自动识别归档统计" hidden>
          <span class="feedback-summary-label">识别归档</span>
          <button class="feedback-summary-tag" type="button" data-feedback-summary-category="BUG">Bug 0</button>
          <button class="feedback-summary-tag" type="button" data-feedback-summary-category="OPTIMIZATION">优化建议 0</button>
          <button class="feedback-summary-tag" type="button" data-feedback-summary-category="REQUIREMENT">需求 0</button>
        </div>
      </section>
      <section class="debug-panel" id="assistant-debug-panel" data-debug-panel aria-label="Forge 连接设置" hidden>
        <form class="connection-form" data-connection-form>
          <label>Forge 请求域<input type="url" inputmode="url" autocomplete="url" spellcheck="false" data-connection-input placeholder="https://forge.example.com" /></label>
          <div class="connection-copy">
            <p data-connection-default></p>
            <p>仅保存当前浏览器；保存后会重新载入页面并重建登录与 WebSocket 连接。</p>
            <p class="connection-error" data-connection-error role="alert" hidden></p>
          </div>
          <div class="connection-actions">
            <span class="connection-status" data-connection-status role="status"></span>
            <div><button class="action" type="button" data-connection-reset>恢复默认</button><button class="submit" type="submit" data-connection-submit>保存并重新连接</button></div>
          </div>
        </form>
        <details class="connection-log">
          <summary>请求日志</summary>
          <div class="debug-header"><span>仅当前页面内存</span><button class="debug-clear" type="button" data-debug-clear>清空</button></div>
          <ol class="debug-list" data-debug-list></ol>
        </details>
      </section>
      <section class="empty" data-empty-state>
        <h3>从当前业务页面开始对话</h3>
        <p>你可以咨询业务、报告问题、提出建议或协助诊断。连接未稳定时消息会进入待发送列表。</p>
      </section>
      <main class="conversation" data-conversation role="log" aria-live="polite" aria-label="对话消息" hidden>
        <div class="history-status" data-history-status role="status" hidden></div>
        <div data-message-list></div>
        <div class="activity" data-activity role="status" aria-live="polite" hidden>
          <span data-state-label></span>
        </div>
      </main>
      <section class="composer">
        <div class="composer-label"><label for="assistant-message">发送消息或图片</label><span class="composer-tools"><button class="image-add" type="button" data-image-add>添加图片</button><input type="file" data-image-input accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden /><span class="composer-shortcut">Ctrl / ⌘ + Enter</span></span></div>
        <div class="attachment-list" data-attachment-list aria-label="待发送图片" hidden></div>
        <textarea id="assistant-message" data-message placeholder="输入问题，或按 Ctrl / ⌘ + V 粘贴截图"></textarea>
        <div class="composer-actions">
          <button class="interrupt" type="button" data-interrupt hidden>中止</button>
          <button class="submit" type="button" data-submit>发送</button>
        </div>
      </section>
      <p class="notice" data-notice role="status" hidden></p>
      <footer><span>消息与图片仅在发送时上传</span><span>可拖动 · Alt + 方向键微调</span></footer>
      </div>
      <section class="feedback-archive" data-feedback-archive hidden>
        <header class="feedback-archive-header"><h3>会话反馈记录</h3><button class="close" type="button" data-feedback-close>返回对话</button></header>
        <div class="feedback-archive-body" data-feedback-archive-body></div>
      </section>
      </div>
    </div>
    <section class="attachment-preview" data-attachment-preview role="dialog" aria-modal="true" aria-labelledby="attachment-preview-title" hidden>
      <header class="attachment-preview-header">
        <h3 class="attachment-preview-title" id="attachment-preview-title" data-attachment-preview-title></h3>
        <button class="attachment-preview-close" type="button" data-attachment-preview-close aria-label="关闭图片预览">关闭</button>
      </header>
      <div class="attachment-preview-body" data-preview-backdrop>
        <img class="attachment-preview-image" data-attachment-preview-image alt="" />
      </div>
    </section>
  </aside>
`
