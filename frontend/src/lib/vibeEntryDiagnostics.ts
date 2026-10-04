import { authFetch } from './api'

type Stage = 'app_mount' | 'shell_mount' | 'chat_engine_mount' | 'page_mount'
  | 'session_lookup' | 'session_switch' | 'session_ready' | 'history_latest' | 'history_earlier'
  | 'html_response' | 'resource_summary'
type Status = 'start' | 'ok' | 'timeout' | 'error'

interface ResourceSummary {
  chatModules: number
  otherFeatureModules: number
  commonModules: number
  transferBytes: number
  lastModuleMs: number
  slowestModuleMs: number
}

const traceId = (window as Window & { __vibeBootTraceId?: string }).__vibeBootTraceId ?? crypto.randomUUID()
const sent = new Set<string>()
const isUuid = (value: string): boolean => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)

/** Navigation-relative timings only. No message text, URLs, credentials or SDP are sent. */
export function reportVibeEntry(stage: Stage, status: Status = 'ok', sessionId?: string | null, once = false,
  elapsedOverride?: number, resources?: ResourceSummary): void {
  if (window.location.pathname !== '/tools/claude-chat') return
  const key = `${stage}:${status}`
  if (once && sent.has(key)) return
  if (once) sent.add(key)
  const elapsedMs = Math.max(0, Math.min(Math.round(elapsedOverride ?? performance.now()), 600_000))
  const body = JSON.stringify({ traceId, stage, status, elapsedMs,
    sessionId: sessionId && isUuid(sessionId) ? sessionId.toLowerCase() : null, resources })
  void authFetch('/claude-chat/diagnostics/entry', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  }).catch(() => { /* Diagnostics must never block the session. */ })
}

/** Only numeric resource totals are sent; module names and URLs stay in the browser. */
export function summarizeVibeResources(entries: PerformanceResourceTiming[]): ResourceSummary {
  const summary: ResourceSummary = { chatModules: 0, otherFeatureModules: 0, commonModules: 0,
    transferBytes: 0, lastModuleMs: 0, slowestModuleMs: 0 }
  for (const entry of entries) {
    let path: string
    try { path = new URL(entry.name).pathname } catch { continue }
    if (!/\.(?:js|mjs|ts|tsx)$/.test(path)) continue
    if (path.startsWith('/src/features/claude-chat/')) summary.chatModules++
    else if (path.startsWith('/src/features/')) summary.otherFeatureModules++
    else summary.commonModules++
    summary.transferBytes += entry.transferSize || 0
    summary.lastModuleMs = Math.max(summary.lastModuleMs, entry.responseEnd)
    summary.slowestModuleMs = Math.max(summary.slowestModuleMs, entry.duration)
  }
  return summary
}

export function reportVibeResourceSummary(): void {
  if (window.location.pathname !== '/tools/claude-chat') return
  const summary = summarizeVibeResources(performance.getEntriesByType('resource') as PerformanceResourceTiming[])
  reportVibeEntry('resource_summary', 'ok', null, true, undefined, {
    ...summary,
    transferBytes: Math.min(Math.round(summary.transferBytes), 1_000_000_000),
    lastModuleMs: Math.min(Math.round(summary.lastModuleMs), 600_000),
    slowestModuleMs: Math.min(Math.round(summary.slowestModuleMs), 600_000),
  })
}
