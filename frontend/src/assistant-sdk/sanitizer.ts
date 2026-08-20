const SENSITIVE_KEY = /authorization|cookie|set-cookie|token|password|passwd|secret|body/i
const MASK = '[REDACTED]'

export interface SanitizerOptions {
  additionalSensitiveFields?: string[]
}

export function sanitizeEvidence<T>(value: T, options: SanitizerOptions = {}): T {
  const additional = new Set(options.additionalSensitiveFields?.map(field => field.toLowerCase()) ?? [])
  return sanitizeValue(value, additional, new WeakSet()) as T
}

function sanitizeValue(value: unknown, additional: Set<string>, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return sanitizeString(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)

  if (Array.isArray(value)) return value.map(item => sanitizeValue(item, additional, seen))

  const sanitized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    sanitized[key] = isSensitive(key, additional) ? MASK : sanitizeValue(child, additional, seen)
  }
  return sanitized
}

function sanitizeString(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:access[_-]?token|refresh[_-]?token|token|password|passwd|secret)=)[^&#\s]*/gi, '$1[REDACTED]')
}

function isSensitive(key: string, additional: Set<string>): boolean {
  return SENSITIVE_KEY.test(key) || additional.has(key.toLowerCase())
}
