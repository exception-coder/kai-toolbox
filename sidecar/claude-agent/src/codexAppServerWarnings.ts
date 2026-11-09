type WarningParams = Record<string, unknown>

/** Native configWarning uses summary; legacy warning uses message/reason. Never expose unknown payloads. */
export function codexWarningMessage(params: WarningParams): string {
  const summary = [params.summary, params.message, params.reason]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
  if (!summary) return 'Codex 返回了一条警告，但未提供可读说明。'
  const details = typeof params.details === 'string' ? params.details.trim() : ''
  return details && !summary.includes(details) ? `${summary}\n${details}` : summary
}

/** A turn owns its warning history, including initialization notifications and legacy duplicates. */
export class CodexAppServerWarnings {
  private readonly seen = new Set<string>()

  accept(params: WarningParams): string | undefined {
    const message = codexWarningMessage(params)
    const key = message.replace(/\s+/g, ' ').trim()
    if (this.seen.has(key)) return undefined
    this.seen.add(key)
    return message
  }
}
