import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentAssistant, initializeAssistant } from './assistantSdk'
import type { AssistantSubmission, AssistantTransport } from './types'

afterEach(() => {
  currentAssistant()?.destroy()
  window.history.replaceState(null, '', '/')
})

describe('initializeAssistant', () => {
  it('keeps one widget and one lifecycle when initialized repeatedly', () => {
    const firstMount = vi.fn()
    const secondMount = vi.fn()

    const first = initializeAssistant({ appId: 'ERP', mountWidget: firstMount })
    const second = initializeAssistant({ appId: 'SCM', mountWidget: secondMount })

    expect(second).toBe(first)
    expect(firstMount).toHaveBeenCalledOnce()
    expect(secondMount).not.toHaveBeenCalled()
    expect(document.querySelectorAll('#kai-assistant-widget-root')).toHaveLength(1)
  })

  it('updates snapshots without retaining a host runtime object reference', async () => {
    const page = { url: '/orders/1', title: '订单详情' }
    const sdk = initializeAssistant({ appId: 'ERP', page: { ...page } })
    page.url = '/orders/2'

    expect((await sdk.snapshot()).page?.url).toBe('/orders/1')
  })

  it('captures the host source revision for module cache invalidation', async () => {
    const sdk = initializeAssistant({ appId: 'ERP', sourceRevision: 'erp-2026.08' })

    expect((await sdk.snapshot()).application.sourceRevision).toBe('erp-2026.08')
  })

  it('updates only explicitly provided context fields', async () => {
    const sdk = initializeAssistant({
      appId: 'ERP',
      user: { id: '7', displayName: '张三' },
      page: { url: '/orders/1' },
      businessObject: { type: 'ORDER', id: '1' },
    })

    sdk.updateContext({ page: { url: '/orders/2' } })
    const updated = await sdk.snapshot()
    expect(updated.user?.id).toBe('7')
    expect(updated.businessObject?.id).toBe('1')
    expect(updated.page?.url).toBe('/orders/2')

    sdk.updateContext({ businessObject: undefined })
    expect((await sdk.snapshot()).businessObject).toBeUndefined()
  })

  it('tracks third-party SPA URL changes and clears stale business context', async () => {
    const updateContext = vi.fn()
    const transport: AssistantTransport = {
      start: () => undefined,
      submit: () => undefined,
      updateContext,
      destroy: vi.fn(),
    }
    const sdk = initializeAssistant({
      appId: 'ERP', page: { url: '/orders/1', routeName: 'order-detail' },
      businessObject: { type: 'ORDER', id: '1' }, transport,
    })

    window.history.pushState(null, '', '/inventory/list?warehouse=2')

    await vi.waitFor(() => expect(updateContext).toHaveBeenCalledWith({
      page: expect.objectContaining({ url: window.location.href }),
      businessObject: undefined,
    }))
    expect((await sdk.snapshot()).page?.url).toBe(window.location.href)
    expect((await sdk.snapshot()).page?.routeName).toBeUndefined()
    expect((await sdk.snapshot()).businessObject).toBeUndefined()
  })

  it('allows third-party hosts to manage URL context explicitly', async () => {
    const updateContext = vi.fn()
    const transport: AssistantTransport = {
      start: () => undefined,
      submit: () => undefined,
      updateContext,
      destroy: vi.fn(),
    }
    const sdk = initializeAssistant({
      appId: 'ERP', page: { url: '/orders/1' }, trackPageUrl: false, transport,
    })

    window.history.pushState(null, '', '/inventory/list')
    await Promise.resolve()

    expect(updateContext).not.toHaveBeenCalled()
    expect((await sdk.snapshot()).page?.url).toBe('/orders/1')
  })

  it('isolates a timed out provider and keeps the other context', async () => {
    vi.useFakeTimers()
    const sdk = initializeAssistant({
      appId: 'ERP',
      providerTimeoutMs: 20,
      providers: [
        { id: 'ready', collect: async () => ({ key: 'order', value: 'SO-1' }) },
        { id: 'slow', collect: () => new Promise(() => undefined) },
      ],
    })

    const snapshotPromise = sdk.snapshot()
    await vi.advanceTimersByTimeAsync(21)
    const snapshot = await snapshotPromise

    expect(snapshot.contributions).toEqual({ order: 'SO-1' })
    expect(snapshot.unavailableProviders).toEqual(['slow'])
    vi.useRealTimers()
  })

  it('sanitizes the complete snapshot before it leaves the SDK', async () => {
    const sdk = initializeAssistant({
      appId: 'ERP',
      page: { url: '/orders?token=secret', title: '订单' },
      businessObject: { type: 'order', id: '1', attributes: { password: 'secret' } },
    })

    const snapshot = await sdk.snapshot()

    expect(snapshot.page?.url).toBe('/orders?token=[REDACTED]')
    expect(snapshot.businessObject?.attributes?.password).toBe('[REDACTED]')
  })

  it('connects a framework-independent transport to widget submissions', async () => {
    let listener: Parameters<AssistantTransport['start']>[0] = () => undefined
    const submissions: AssistantSubmission[] = []
    const transport: AssistantTransport = {
      start: value => { listener = value },
      submit: submission => { submissions.push(submission) },
      destroy: vi.fn(),
    }
    const sdk = initializeAssistant({ appId: 'ERP', transport })
    sdk.open('DIAGNOSE')
    const root = document.getElementById('kai-assistant-widget-root')!
    root.dispatchEvent(new CustomEvent('assistant-submit', {
      detail: { mode: 'DIAGNOSE', text: '检查订单' },
    }))
    await vi.waitFor(() => expect(submissions).toHaveLength(1))

    expect(submissions[0]).toMatchObject({ mode: 'DIAGNOSE', text: '检查订单' })
    listener({ state: '已完成', messages: [] })
    expect(document.querySelector('kai-assistant-widget')?.shadowRoot
      ?.querySelector('[data-state-label]')?.textContent).toBe('已完成')
  })

  it('synchronizes the hidden state even when no transport is configured', () => {
    const sdk = initializeAssistant({ appId: 'ERP' })
    sdk.open('QUESTION')
    const root = document.getElementById('kai-assistant-widget-root')!

    root.dispatchEvent(new CustomEvent('assistant-hidden'))

    expect(root.dataset.open).toBe('false')
  })
})
