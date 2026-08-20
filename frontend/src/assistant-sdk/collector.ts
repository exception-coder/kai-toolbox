import { sanitizeEvidence, type SanitizerOptions } from './sanitizer'

const MAX_EVENTS = 100
const DEFAULT_DIAGNOSTIC_WINDOW = 20

export type AssistantEvidenceEvent =
  | { type: 'js-error'; message: string; source?: string; line?: number; column?: number; capturedAt: number }
  | { type: 'promise-rejection'; reason: string; capturedAt: number }
  | { type: 'network-error'; method: string; url: string; status?: number; durationMs: number; capturedAt: number }
  | { type: 'interaction'; name: string; detail?: Record<string, unknown>; capturedAt: number }

export interface AssistantCollectorOptions extends SanitizerOptions {
  ignoreUrls?: string[]
}

export class AssistantCollector {
  private readonly events: AssistantEvidenceEvent[] = []
  private readonly ignoreUrls: string[]
  private started = false
  private originalFetch?: typeof window.fetch
  private observedFetch?: typeof window.fetch
  private originalXhrOpen?: typeof XMLHttpRequest.prototype.open
  private originalXhrSend?: typeof XMLHttpRequest.prototype.send
  private observedXhrOpen?: typeof XMLHttpRequest.prototype.open
  private observedXhrSend?: typeof XMLHttpRequest.prototype.send
  private readonly xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string; startedAt: number }>()

  constructor(private readonly options: AssistantCollectorOptions = {}) {
    this.ignoreUrls = options.ignoreUrls ?? []
  }

  start(): void {
    if (this.started) return
    this.started = true
    window.addEventListener('error', this.handleError)
    window.addEventListener('unhandledrejection', this.handleRejection)
    try {
      this.installNetworkObservers()
    } catch {
      this.restoreNetworkObservers()
    }
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    window.removeEventListener('error', this.handleError)
    window.removeEventListener('unhandledrejection', this.handleRejection)
    this.restoreNetworkObservers()
  }

  recordNetwork(input: { method: string; url: string; status?: number; durationMs: number }): void {
    if (this.ignoreUrls.some(ignored => input.url.includes(ignored))) return
    if (input.status !== undefined && input.status < 400) return
    this.push({ type: 'network-error', ...input, capturedAt: Date.now() })
  }

  recordInteraction(name: string, detail?: Record<string, unknown>): void {
    this.push({ type: 'interaction', name, detail, capturedAt: Date.now() })
  }

  diagnosticWindow(limit = DEFAULT_DIAGNOSTIC_WINDOW): AssistantEvidenceEvent[] {
    const safeLimit = Math.max(0, Math.min(limit, MAX_EVENTS))
    return sanitizeEvidence(this.events.slice(-safeLimit), this.options)
  }

  size(): number {
    return this.events.length
  }

  private readonly handleError = (event: ErrorEvent) => {
    this.push({
      type: 'js-error',
      message: event.message,
      source: event.filename || undefined,
      line: event.lineno || undefined,
      column: event.colno || undefined,
      capturedAt: Date.now(),
    })
  }

  private readonly handleRejection = (event: PromiseRejectionEvent) => {
    this.push({ type: 'promise-rejection', reason: stringifyReason(event.reason), capturedAt: Date.now() })
  }

  private push(event: AssistantEvidenceEvent): void {
    this.events.push(event)
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS)
  }

  private installNetworkObservers(): void {
    this.originalFetch = window.fetch
    const collector = this
    this.observedFetch = async function observedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const startedAt = performance.now()
      const method = init?.method || (input instanceof Request ? input.method : 'GET')
      const url = input instanceof Request ? input.url : String(input)
      try {
        const response = await collector.originalFetch!.call(window, input, init)
        collector.recordNetwork({ method, url, status: response.status, durationMs: performance.now() - startedAt })
        return response
      } catch (error) {
        collector.recordNetwork({ method, url, durationMs: performance.now() - startedAt })
        throw error
      }
    }
    window.fetch = this.observedFetch

    this.originalXhrOpen = XMLHttpRequest.prototype.open
    this.originalXhrSend = XMLHttpRequest.prototype.send
    const originalOpen = this.originalXhrOpen
    const originalSend = this.originalXhrSend
    this.observedXhrOpen = function observedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      collector.xhrMeta.set(this, { method, url: String(url), startedAt: 0 })
      return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>)
    }
    this.observedXhrSend = function observedSend(this: XMLHttpRequest, body?: Parameters<typeof originalSend>[0]) {
      const meta = collector.xhrMeta.get(this)
      if (meta) {
        meta.startedAt = performance.now()
        this.addEventListener('loadend', () => collector.recordNetwork({
          method: meta.method,
          url: meta.url,
          status: this.status || undefined,
          durationMs: performance.now() - meta.startedAt,
        }), { once: true })
      }
      return originalSend.call(this, body)
    }
    XMLHttpRequest.prototype.open = this.observedXhrOpen
    XMLHttpRequest.prototype.send = this.observedXhrSend
  }

  private restoreNetworkObservers(): void {
    if (this.originalFetch && window.fetch === this.observedFetch) window.fetch = this.originalFetch
    if (this.originalXhrOpen && XMLHttpRequest.prototype.open === this.observedXhrOpen) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen
    }
    if (this.originalXhrSend && XMLHttpRequest.prototype.send === this.observedXhrSend) {
      XMLHttpRequest.prototype.send = this.originalXhrSend
    }
    this.originalFetch = undefined
    this.observedFetch = undefined
    this.originalXhrOpen = undefined
    this.originalXhrSend = undefined
    this.observedXhrOpen = undefined
    this.observedXhrSend = undefined
  }
}

function stringifyReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason
  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}
