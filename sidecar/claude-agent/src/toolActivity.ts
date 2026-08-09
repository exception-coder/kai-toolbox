export type ToolActivityStatus = 'inProgress' | 'completed' | 'failed'

type Emit = (event: Record<string, unknown>) => void

export interface ToolActivity {
  toolCallId: string
  toolName: string
  status: ToolActivityStatus
  title?: string
  detail?: string
  elapsedMs?: number
  outputTail?: string
}

const MAX_TITLE_CHARS = 160
const MAX_DETAIL_CHARS = 500
const MAX_OUTPUT_CHARS = 8_000
const SENSITIVE_KEY = /(authorization|password|passwd|secret|token|api[-_]?key|credential|cookie)/i

/**
 * Emit the provider-neutral tool lifecycle event consumed by the Java relay and React UI.
 * Provider adapters must pass their native stable call id; display text is bounded here so
 * an always-visible activity summary cannot accidentally dump an entire tool payload.
 */
export function emitToolActivity(emit: Emit, activity: ToolActivity): void {
  if (!activity.toolCallId) return
  emit({
    type: 'toolActivity',
    toolCallId: activity.toolCallId,
    toolName: activity.toolName || 'tool',
    status: activity.status,
    title: bounded(activity.title == null ? undefined : redactSensitiveText(activity.title), MAX_TITLE_CHARS)
      || defaultTitle(activity.toolName, activity.status),
    detail: bounded(activity.detail == null ? undefined : redactSensitiveText(activity.detail), MAX_DETAIL_CHARS),
    elapsedMs: finiteNonNegative(activity.elapsedMs),
    outputTail: tail(activity.outputTail, MAX_OUTPUT_CHARS),
  })
}

export function summarizeToolInput(input: unknown): string | undefined {
  if (typeof input === 'string') return bounded(redactSensitiveText(input), MAX_DETAIL_CHARS)
  if (!isRecord(input)) return undefined

  const preferredKeys = ['command', 'file_path', 'filePath', 'path', 'query', 'pattern', 'description', 'prompt', 'cwd']
  const parts: string[] = []
  for (const key of preferredKeys) {
    if (SENSITIVE_KEY.test(key)) continue
    const value = input[key]
    if (typeof value === 'string' && value.trim()) parts.push(`${key}: ${redactSensitiveText(value.trim())}`)
    if (parts.length >= 2) break
  }
  return bounded(parts.join(' · '), MAX_DETAIL_CHARS)
}

export function activityOutputTail(output: unknown): string | undefined {
  if (output == null) return undefined
  if (typeof output === 'string') return tail(redactSensitiveText(output), MAX_OUTPUT_CHARS)
  try {
    return tail(JSON.stringify(redactRecord(output)), MAX_OUTPUT_CHARS)
  } catch {
    return tail(String(output), MAX_OUTPUT_CHARS)
  }
}

export function elapsedSince(startedAt: number | undefined): number | undefined {
  return startedAt == null ? undefined : Math.max(0, Date.now() - startedAt)
}

function defaultTitle(toolName: string, status: ToolActivityStatus): string {
  const name = toolName || '工具'
  if (status === 'failed') return `${name} 执行失败`
  if (status === 'completed') return `${name} 执行完成`
  return `${name} 执行中…`
}

function bounded(value: string | undefined, limit: number): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized
}

function tail(value: string | undefined, limit: number): string | undefined {
  if (!value) return undefined
  const sanitized = redactSensitiveText(value)
  return sanitized.length > limit ? `…${sanitized.slice(-(limit - 1))}` : sanitized
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined
}

function redactRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRecord)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactRecord(nested),
  ]))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(token|password|passwd|secret|api[-_]?key|authorization)\b(\s*(?:=|:)\s*|\s+)("[^"]*"|'[^']*'|[^\s]+)/gi,
      (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`)
}
