import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssistantCollector } from './collector'
import { sanitizeEvidence } from './sanitizer'

describe('AssistantCollector', () => {
  const started: AssistantCollector[] = []
  afterEach(() => started.splice(0).forEach(collector => collector.stop()))
  it('keeps only the latest one hundred events and returns twenty by default', () => {
    const collector = new AssistantCollector()
    for (let index = 0; index < 105; index += 1) {
      collector.recordInteraction(`event-${index}`)
    }

    expect(collector.size()).toBe(100)
    const diagnostic = collector.diagnosticWindow()
    expect(diagnostic).toHaveLength(20)
    expect(diagnostic[0]).toMatchObject({ type: 'interaction', name: 'event-85' })
  })

  it('ignores configured URLs and successful network calls', () => {
    const collector = new AssistantCollector({ ignoreUrls: ['/health'] })
    collector.recordNetwork({ method: 'GET', url: '/health', status: 500, durationMs: 10 })
    collector.recordNetwork({ method: 'GET', url: '/orders', status: 200, durationMs: 10 })
    collector.recordNetwork({ method: 'POST', url: '/orders', status: 500, durationMs: 20 })

    expect(collector.diagnosticWindow()).toHaveLength(1)
  })

  it('observes failed fetches without reading request or response bodies', async () => {
    const originalFetch = window.fetch
    window.fetch = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    const collector = new AssistantCollector()
    started.push(collector)
    collector.start()

    await window.fetch('/orders/1', { method: 'POST', body: 'sensitive-body' })

    expect(collector.diagnosticWindow()).toEqual([
      expect.objectContaining({ type: 'network-error', method: 'POST', url: '/orders/1', status: 500 }),
    ])
    collector.stop()
    window.fetch = originalFetch
  })

  it('does not overwrite an observer installed by the host after startup', () => {
    const originalFetch = window.fetch
    const collector = new AssistantCollector()
    started.push(collector)
    collector.start()
    const hostObserver = vi.fn(originalFetch)
    window.fetch = hostObserver

    collector.stop()

    expect(window.fetch).toBe(hostObserver)
    window.fetch = originalFetch
  })
})

describe('sanitizeEvidence', () => {
  it('removes default and host-configured sensitive fields recursively', () => {
    const value = sanitizeEvidence({
      headers: { Authorization: 'Bearer secret', Cookie: 'sid=1' },
      body: { password: 'secret' },
      customerCode: 'C-1',
    }, { additionalSensitiveFields: ['customerCode'] })

    expect(JSON.stringify(value)).not.toContain('secret')
    expect(JSON.stringify(value)).not.toContain('sid=1')
    expect(value.customerCode).toBe('[REDACTED]')
  })

  it('redacts credentials embedded in strings and URL query parameters', () => {
    const value = sanitizeEvidence({
      message: 'request failed with Bearer abc.def',
      url: '/orders?token=secret-token&orderId=1',
    })

    expect(value.message).toBe('request failed with Bearer [REDACTED]')
    expect(value.url).toBe('/orders?token=[REDACTED]&orderId=1')
  })
})
