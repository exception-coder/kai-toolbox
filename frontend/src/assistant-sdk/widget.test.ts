import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentAssistant, initializeAssistant } from './assistantSdk'
import type { AssistantFeedbackArchiveClient, AssistantTransport, AssistantWidgetState } from './types'
import { createAssistantDebugEntry } from './assistantDebugLog'

afterEach(() => {
  currentAssistant()?.destroy()
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('assistant widget', () => {
  it('logs in with an existing Forge account before revealing consultation controls', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      accessToken: 'forge-access', refreshToken: 'ignored', expiresIn: 1800,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    initializeAssistant({
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      externalLogin: { loginUrl: 'https://forge.example.com/api/auth/external-login' },
    }).open('QUESTION')
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const authentication = shadow.querySelector<HTMLElement>('[data-authentication]')!
    const content = shadow.querySelector<HTMLElement>('[data-authenticated-content]')!
    const username = shadow.querySelector<HTMLInputElement>('[data-login-username]')!
    const password = shadow.querySelector<HTMLInputElement>('[data-login-password]')!

    expect(authentication.hidden).toBe(false)
    expect(content.hidden).toBe(true)
    username.value = 'forge-user'
    password.value = 'secret'
    shadow.querySelector<HTMLFormElement>('[data-login-form]')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(authentication.hidden).toBe(true))
    expect(content.hidden).toBe(false)
    expect(password.value).toBe('')
    expect(shadow.querySelector('[data-state-label]')?.textContent).toBe('已就绪')
  })

  it('keeps a valid Forge login when the SDK is destroyed and initialized again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      accessToken: 'forge-access', expiresIn: 1800,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const options = {
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      externalLogin: { loginUrl: 'https://forge.example.com/api/auth/external-login' },
    }
    initializeAssistant(options).open('QUESTION')
    let shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    shadow.querySelector<HTMLInputElement>('[data-login-username]')!.value = 'forge-user'
    shadow.querySelector<HTMLInputElement>('[data-login-password]')!.value = 'secret'
    shadow.querySelector<HTMLFormElement>('[data-login-form]')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('[data-authentication]')!.hidden).toBe(true))

    currentAssistant()!.destroy()
    initializeAssistant(options).open('QUESTION')
    shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!

    expect(shadow.querySelector<HTMLElement>('[data-authentication]')!.hidden).toBe(true)
    expect(shadow.querySelector<HTMLElement>('[data-authenticated-content]')!.hidden).toBe(false)
  })

  it('keeps the username, clears the password and allows retry after a Forge login failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    initializeAssistant({
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      externalLogin: { loginUrl: 'https://forge.example.com/api/auth/external-login' },
    }).open('QUESTION')
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const username = shadow.querySelector<HTMLInputElement>('[data-login-username]')!
    const password = shadow.querySelector<HTMLInputElement>('[data-login-password]')!
    username.value = 'forge-user'
    password.value = 'wrong'

    shadow.querySelector<HTMLFormElement>('[data-login-form]')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('[data-login-error]')!.hidden).toBe(false))
    expect(shadow.querySelector('[data-login-error]')?.textContent).toContain('账号或密码不正确')
    expect(username.value).toBe('forge-user')
    expect(password.value).toBe('')
    expect(shadow.querySelector<HTMLButtonElement>('[data-login-submit]')!.disabled).toBe(false)
  })

  it('keeps authentication failures in the login recovery view instead of the conversation notice', () => {
    initializeAssistant({
      appId: 'ERP', wsUrl: 'wss://forge.example.com/api/claude-chat/consult/ws',
      externalLogin: { loginUrl: 'https://forge.example.com/api/auth/external-login' },
    }).open('QUESTION')
    const root = document.getElementById('kai-assistant-widget-root')!
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!

    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: { state: '认证失败', message: 'Forge 登录已失效，请重新登录', authenticationRequired: true },
    }))

    expect(shadow.querySelector('[data-login-error]')?.textContent).toContain('登录已失效')
    expect(shadow.querySelector<HTMLElement>('[data-notice]')!.hidden).toBe(true)
    expect(shadow.querySelector<HTMLElement>('[data-authentication]')!.hidden).toBe(false)
  })

  it('uses a shadow root and relies on automatic classification instead of manual mode buttons', () => {
    const sdk = initializeAssistant({ appId: 'ERP' })
    sdk.open('BUG')

    const widget = document.querySelector('kai-assistant-widget')
    const panel = widget?.shadowRoot?.querySelector<HTMLElement>('[data-panel]')
    expect(widget?.shadowRoot).not.toBeNull()
    expect(panel?.hidden).toBe(false)
    expect(widget?.shadowRoot?.querySelector('[data-launcher] .capsule-icon')).not.toBeNull()
    expect(widget?.shadowRoot?.querySelector('[data-launcher]')?.getAttribute('aria-label')).toBe('打开 AI 助手')
    expect(widget?.shadowRoot?.textContent).toContain('连接未稳定时消息会进入待发送列表')
    expect(widget?.shadowRoot?.querySelectorAll('[data-mode]')).toHaveLength(0)
    expect(widget?.shadowRoot?.querySelector('[data-mode-label]')?.textContent).toBe('报告问题')
  })

  it('reviews and corrects auto-classified feedback under three fixed tags', async () => {
    const candidate = {
      id: 'candidate-1', sessionId: 'session-1', category: 'BUG' as const,
      requirementType: 'BUG_FIX', content: '导出按钮无响应', confidence: .96,
      reason: '已有功能失败', pageUrl: '/orders', pageTitle: '订单', detectedAt: 1000,
      updateTime: 1000, revisionNo: 0, attachments: [],
    }
    const archive: AssistantFeedbackArchiveClient = {
      listSessions: vi.fn(async () => ({ items: [{
        id: 'session-1', title: '订单咨询', lastSeenAt: 1000,
        counts: { bug: 1, optimization: 2, requirement: 3 },
      }] })),
      listCandidates: vi.fn(async () => ({ items: [candidate] })),
      listRevisions: vi.fn(async () => ({ items: [] })),
      updateCandidate: vi.fn(async (_sessionId, _candidate, update) => ({
        ...candidate, ...update, updateTime: 2000, revisionNo: 1,
        aiOriginal: { revisionNo: 0, source: 'AI' as const, category: 'BUG' as const,
          requirementType: 'BUG_FIX', content: candidate.content, createdAt: 1000 },
      })),
      loadAttachment: vi.fn(),
    }
    const transport: AssistantTransport & AssistantFeedbackArchiveClient = {
      start: () => undefined, submit: () => undefined, destroy: () => undefined, ...archive,
    }
    initializeAssistant({ appId: 'ERP', transport }).open()
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!

    shadow.querySelector<HTMLButtonElement>('[data-feedback-open]')!.click()
    await vi.waitFor(() => expect(shadow.querySelector('[data-feedback-archive-body]')?.textContent)
      .toContain('订单咨询'))
    expect(shadow.querySelector('[data-feedback-archive-body]')?.textContent).toContain('Bug 1')
    expect(shadow.querySelector('[data-feedback-archive-body]')?.textContent).toContain('优化建议 2')
    expect(shadow.querySelector('[data-feedback-archive-body]')?.textContent).toContain('需求 3')

    const bugTag = [...shadow.querySelectorAll<HTMLButtonElement>('.feedback-tag')]
      .find(button => button.textContent?.startsWith('Bug'))!
    bugTag.click()
    await vi.waitFor(() => expect(shadow.querySelector('.feedback-content')?.textContent)
      .toBe('导出按钮无响应'))
    shadow.querySelector<HTMLButtonElement>('.feedback-card-actions .feedback-link')!.click()
    const select = shadow.querySelector<HTMLSelectElement>('.feedback-edit select')!
    const textarea = shadow.querySelector<HTMLTextAreaElement>('.feedback-edit textarea')!
    select.value = 'OPTIMIZATION'
    textarea.value = '优化导出按钮的响应提示'
    shadow.querySelector<HTMLFormElement>('.feedback-edit')!
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(archive.updateCandidate).toHaveBeenCalledWith(
      'session-1', candidate, expect.objectContaining({
        category: 'OPTIMIZATION', content: '优化导出按钮的响应提示', requirementType: 'MODULE_ADJUST',
      }),
    ))
  })

  it('switches an automatic conversation to the detected feedback type', () => {
    initializeAssistant({ appId: 'ERP' }).open('AUTO')
    const root = document.getElementById('kai-assistant-widget-root')!
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!

    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: {
        state: '已识别反馈', detectedIntent: 'SUGGESTION', detectionConfidence: 0.9,
        message: '已识别为需求反馈，可编辑后保存草稿',
      },
    }))

    expect(shadow.querySelector('[data-mode-label]')?.textContent).toBe('提出建议')
    expect(shadow.querySelector('[data-mode]')).toBeNull()
    expect(shadow.querySelector<HTMLElement>('[data-draft-actions]')!.hidden).toBe(false)
  })

  it('keeps the automatic mode and context strip visible when conversation content grows', () => {
    const sdk = initializeAssistant({ appId: 'ERP' })
    sdk.open('QUESTION')
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const styles = shadow.querySelector('style')!.textContent ?? ''

    expect(styles).not.toContain('.modes {')
    expect(styles).toMatch(/\.context-strip \{[^}]*flex: 0 0 auto;/)
  })

  it('emits mode and text only after an explicit send action', () => {
    const sdk = initializeAssistant({ appId: 'ERP' })
    sdk.open('BUG')
    const widget = document.querySelector('kai-assistant-widget')!
    const submitted: unknown[] = []
    widget.addEventListener('assistant-submit', event => submitted.push((event as CustomEvent).detail))

    const input = widget.shadowRoot!.querySelector<HTMLTextAreaElement>('[data-message]')!
    input.value = '订单审核返回 500'
    input.dispatchEvent(new Event('input'))
    widget.shadowRoot!.querySelector<HTMLButtonElement>('[data-submit]')!.click()

    expect(submitted).toEqual([{ mode: 'BUG', text: '订单审核返回 500' }])
    expect(input.value).toBe('')
  })

  it('pastes an image, previews it and allows an image-only submission', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview-1'),
      revokeObjectURL: vi.fn(),
    })
    const sdk = initializeAssistant({ appId: 'ERP' })
    sdk.open('DIAGNOSE')
    const widget = document.querySelector('kai-assistant-widget')!
    const shadow = widget.shadowRoot!
    const submitted: Array<{ attachments?: Array<{ file: File }> }> = []
    widget.addEventListener('assistant-submit', event => submitted.push((event as CustomEvent).detail))
    const file = new File(['image'], 'image.png', { type: 'image/png' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      getData: () => '',
    } })

    shadow.querySelector<HTMLTextAreaElement>('[data-message]')!.dispatchEvent(paste)

    expect(shadow.querySelector<HTMLElement>('[data-attachment-list]')!.hidden).toBe(false)
    expect(shadow.querySelector<HTMLImageElement>('[data-attachment-list] img')?.src).toBe('blob:preview-1')
    expect(shadow.querySelector<HTMLButtonElement>('[data-submit]')!.disabled).toBe(false)
    const previewTrigger = shadow.querySelector<HTMLButtonElement>('.attachment-preview-trigger')!
    previewTrigger.click()
    const preview = shadow.querySelector<HTMLElement>('[data-attachment-preview]')!
    expect(preview.hidden).toBe(false)
    expect(shadow.querySelector<HTMLImageElement>('[data-attachment-preview-image]')?.src).toBe('blob:preview-1')
    expect(shadow.querySelector('[data-attachment-preview-title]')?.textContent).toBe('image.png')
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    expect(preview.hidden).toBe(true)
    expect(shadow.activeElement).toBe(previewTrigger)
    shadow.querySelector<HTMLButtonElement>('[data-submit]')!.click()
    expect(submitted[0].attachments?.[0].file).toBe(file)
  })

  it('adds mobile-selected images through the native file picker', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mobile'), revokeObjectURL: vi.fn() })
    initializeAssistant({ appId: 'ERP' }).open('QUESTION')
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const input = shadow.querySelector<HTMLInputElement>('[data-image-input]')!
    const file = new File(['photo'], 'camera.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })

    input.dispatchEvent(new Event('change'))

    expect(input.accept).toBe('image/png,image/jpeg,image/gif,image/webp')
    expect(input.multiple).toBe(true)
    expect(shadow.querySelector('[data-attachment-list]')?.textContent).toContain('camera.jpg')
    expect(shadow.querySelector<HTMLButtonElement>('[data-submit]')!.disabled).toBe(false)
  })

  it('reports a missing websocket configuration instead of staying in preparation', () => {
    const sdk = initializeAssistant({ appId: 'ERP' })
    sdk.open('QUESTION')
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const input = shadow.querySelector<HTMLTextAreaElement>('[data-message]')!
    input.value = '测试缺失配置'
    input.dispatchEvent(new Event('input'))
    shadow.querySelector<HTMLButtonElement>('[data-submit]')!.click()

    expect(shadow.querySelector('[data-state-label]')?.textContent).toBe('配置缺失')
    expect(shadow.querySelector('[data-notice]')?.textContent).toContain('wsUrl')
    shadow.querySelector<HTMLButtonElement>('[data-debug-toggle]')!.click()
    expect(shadow.querySelector('[data-debug-list]')?.textContent).toContain('缺少 WebSocket Transport')
  })

  it('shows the submitted message and preparation state immediately, then locks sending until completion', async () => {
    let finishProvider: (() => void) | undefined
    const providerResult = new Promise<{ key: string; value: string }>(resolve => {
      finishProvider = () => resolve({ key: 'order', value: 'SO-1' })
    })
    const submit = vi.fn()
    const transport: AssistantTransport = {
      start: () => undefined,
      submit,
      destroy: () => undefined,
    }
    initializeAssistant({
      appId: 'ERP',
      transport,
      providers: [{ id: 'slow-order', collect: () => providerResult }],
    }).open('QUESTION')
    const root = document.getElementById('kai-assistant-widget-root')!
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const input = shadow.querySelector<HTMLTextAreaElement>('[data-message]')!
    const sendButton = shadow.querySelector<HTMLButtonElement>('[data-submit]')!
    const conversation = shadow.querySelector<HTMLElement>('[data-conversation]')!

    input.value = '为什么订单不能审核？'
    input.dispatchEvent(new Event('input'))
    sendButton.click()

    expect(conversation.textContent).toContain('为什么订单不能审核？')
    expect(conversation.textContent).toContain('正在准备当前页面上下文')
    expect(shadow.querySelector('[data-context-strip]')?.textContent).not.toContain('正在准备')
    expect(sendButton.disabled).toBe(true)
    expect(submit).not.toHaveBeenCalled()

    input.value = '生成期间不能再发送'
    input.dispatchEvent(new Event('input'))
    expect(sendButton.disabled).toBe(true)

    finishProvider?.()
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce())
    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: {
        state: '回复中',
        messages: [{ id: 'u-1', role: 'user', content: '为什么订单不能审核？' }],
      },
    }))
    expect(conversation.textContent).toContain('AI 正在生成回复')
    expect(sendButton.disabled).toBe(true)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    sendButton.click()
    expect(submit).toHaveBeenCalledOnce()

    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: {
        state: '已完成',
        messages: [
          { id: 'u-1', role: 'user', content: '为什么订单不能审核？' },
          { id: 'a-1', role: 'assistant', content: '请检查审核状态。' },
        ],
      },
    }))
    expect(sendButton.disabled).toBe(false)
  })

  it('interrupts context preparation and shows in-memory request debug logs', async () => {
    const submit = vi.fn()
    const interrupt = vi.fn()
    const transport: AssistantTransport = {
      start: () => undefined,
      submit,
      interrupt,
      destroy: () => undefined,
    }
    initializeAssistant({
      appId: 'ERP', transport,
      providers: [{ id: 'blocked', collect: () => new Promise(() => undefined) }],
    }).open('QUESTION')
    const root = document.getElementById('kai-assistant-widget-root')!
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const input = shadow.querySelector<HTMLTextAreaElement>('[data-message]')!
    input.value = '检查卡住的请求'
    input.dispatchEvent(new Event('input'))
    shadow.querySelector<HTMLButtonElement>('[data-submit]')!.click()

    const interruptButton = shadow.querySelector<HTMLButtonElement>('[data-interrupt]')!
    expect(interruptButton.hidden).toBe(false)
    interruptButton.click()

    await vi.waitFor(() => expect(shadow.querySelector('[data-state-label]')?.textContent).toBe('已中止'))
    expect(submit).not.toHaveBeenCalled()
    expect(interrupt).not.toHaveBeenCalled()
    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: { debugEntry: createAssistantDebugEntry('connection', 'WebSocket 连接成功', { attempt: 1 }) },
    }))
    const debugToggle = shadow.querySelector<HTMLButtonElement>('[data-debug-toggle]')!
    debugToggle.click()
    expect(debugToggle.getAttribute('aria-expanded')).toBe('true')
    expect(shadow.querySelector('[data-debug-list]')?.textContent).toContain('开始采集页面上下文')
    expect(shadow.querySelector('[data-debug-list]')?.textContent).toContain('WebSocket 连接成功')
    expect(shadow.querySelector('[data-debug-list]')?.textContent).not.toContain('检查卡住的请求')
  })

  it('renders the complete conversation and sanitized markdown in the message feed', () => {
    initializeAssistant({ appId: 'ERP' }).open('QUESTION')
    const root = document.getElementById('kai-assistant-widget-root')!
    const widget = document.querySelector('kai-assistant-widget')!
    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: {
        state: '回复中',
        messages: [
          { id: 'u-1', role: 'user', content: '给我分析一下' },
          {
            id: 'a-1', role: 'assistant', streaming: true,
            content: '## 分析结果\n\n这里是 **完整内容**。<script>window.alert("x")</script>',
          },
        ],
      },
    }))

    const conversation = widget.shadowRoot!.querySelector<HTMLElement>('[data-conversation]')!
    expect(conversation.textContent).toContain('给我分析一下')
    expect(conversation.querySelector('h2')?.textContent).toBe('分析结果')
    expect(conversation.querySelector('strong')?.textContent).toBe('完整内容')
    expect(conversation.querySelector('script')).toBeNull()
    expect(conversation.textContent).toContain('正在生成')

    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: {
        state: '已完成',
        messages: [
          { id: 'u-1', role: 'user', content: '给我分析一下' },
          { id: 'a-1', role: 'assistant', content: '## 分析结果\n\n这里是 **完整内容**。' },
        ],
      },
    }))
    expect(widget.shadowRoot!.querySelector('[data-state-label]')?.textContent).toBe('已完成')
    expect(conversation.textContent).not.toContain('正在生成')

    root.dispatchEvent(new CustomEvent<AssistantWidgetState>('kai-assistant-state', {
      detail: { users: [{ userId: 7, displayName: '开发甲' }] },
    }))
    expect(widget.shadowRoot!.querySelector('[data-state-label]')?.textContent).toBe('已完成')
    expect(widget.shadowRoot!.querySelector('[data-engineer]')?.textContent).toContain('开发甲')
  })

  it('keeps the assistant hidden until the default shortcut and display key succeed', () => {
    initializeAssistant({
      appId: 'ERP',
      visibility: { initiallyHidden: true, activationKey: 'erp-ai' },
    })
    const root = document.getElementById('kai-assistant-widget-root')!
    const widget = document.querySelector('kai-assistant-widget')!
    const shadow = widget.shadowRoot!
    const launcher = shadow.querySelector<HTMLButtonElement>('[data-launcher]')!
    const panel = shadow.querySelector<HTMLElement>('[data-panel]')!
    const unlock = shadow.querySelector<HTMLElement>('[data-unlock]')!
    const input = shadow.querySelector<HTMLInputElement>('[data-unlock-input]')!

    expect(launcher.hidden).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a', ctrlKey: true, shiftKey: true, bubbles: true,
    }))
    expect(unlock.hidden).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true,
    }))
    expect(unlock.hidden).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ')', code: 'Digit0', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true,
    }))
    expect(unlock.hidden).toBe(false)

    input.value = 'wrong'
    shadow.querySelector<HTMLButtonElement>('[data-unlock-submit]')!.click()
    expect(shadow.querySelector<HTMLElement>('[data-unlock-error]')!.hidden).toBe(false)
    expect(panel.hidden).toBe(true)

    input.value = 'erp-ai'
    shadow.querySelector<HTMLButtonElement>('[data-unlock-submit]')!.click()
    expect(launcher.hidden).toBe(false)
    expect(panel.hidden).toBe(false)

    shadow.querySelector<HTMLButtonElement>('[data-hide-assistant]')!.click()
    expect(launcher.hidden).toBe(true)
    expect(panel.hidden).toBe(true)
    expect(root.dataset.open).toBe('false')
  })

  it('allows a trusted host action to open an initially hidden assistant directly', () => {
    const sdk = initializeAssistant({
      appId: 'ERP',
      visibility: { initiallyHidden: true, activationKey: 'erp-ai' },
    })
    sdk.open('DIAGNOSE')

    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    expect(shadow.querySelector<HTMLButtonElement>('[data-launcher]')!.hidden).toBe(false)
    expect(shadow.querySelector<HTMLElement>('[data-panel]')!.hidden).toBe(false)
    expect(shadow.querySelector<HTMLElement>('[data-unlock]')!.hidden).toBe(true)
  })

  it('handles the shortcut before a host page stops keydown propagation', () => {
    initializeAssistant({
      appId: 'ERP',
      visibility: { initiallyHidden: true, activationKey: 'erp-ai' },
    })
    const shadow = document.querySelector('kai-assistant-widget')!.shadowRoot!
    const blocker = document.createElement('div')
    const target = document.createElement('button')
    blocker.append(target)
    blocker.addEventListener('keydown', event => event.stopPropagation())
    document.body.append(blocker)

    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: ')', code: 'Digit0', metaKey: true, altKey: true, shiftKey: true, bubbles: true,
    }))

    expect(shadow.querySelector<HTMLElement>('[data-unlock]')!.hidden).toBe(false)
    blocker.remove()
  })
})
