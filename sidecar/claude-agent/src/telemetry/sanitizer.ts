const SENSITIVE_KEY = /(authorization|auth[_-]?token|api[_-]?key|password|secret|cookie|connection[_-]?string)/i
const BEARER = /bearer\s+[a-z0-9._~+\-/]+=*/gi
const URL_CREDENTIAL = /(https?:\/\/)[^/@\s:]+:[^/@\s]+@/gi
const SECRET_ASSIGNMENT = /(token|api[_-]?key|password|secret)=([^&\s]+)/gi

const maxLength = Math.max(64, Number(process.env.TOOLBOX_OBSERVABILITY_MAX_ATTRIBUTE_LENGTH) || 512)

export function sanitizeText(value: unknown): string {
  const text = String(value ?? '')
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(URL_CREDENTIAL, '$1[REDACTED]@')
    .replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
  return text.length <= maxLength ? text : text.slice(0, maxLength)
}

export function sanitizeAttributes(input: unknown): Record<string, string | number | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, string | number | boolean> = {}
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    const key = sanitizeText(rawKey).trim()
    if (!key || value == null) continue
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[REDACTED]'
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      out[key] = value
    } else {
      out[key] = sanitizeText(value)
    }
  }
  return out
}

export function inputKeySummary(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ''
  return Object.keys(input as Record<string, unknown>).sort().slice(0, 32).join(',')
}

export function outputLength(output: unknown): number {
  if (output == null) return 0
  if (typeof output === 'string') return output.length
  try {
    return JSON.stringify(output).length
  } catch {
    return 0
  }
}
