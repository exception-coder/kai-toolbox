type WarningParams = Record<string, unknown>

/** Native configWarning uses summary; legacy warning uses message/reason. Never expose unknown payloads. */
export function codexWarningMessage(params: WarningParams): string {
  const summary = [params.summary, params.message, params.reason]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
  if (!summary) return 'Codex 返回了一条警告，但未提供可读说明。'
  const details = typeof params.details === 'string' ? params.details.trim() : ''
  return details && !summary.includes(details) ? `${summary}\n${details}` : summary
}

export function codexAppServerWarning(message: string): { code: string; message: string } {
  if (message.startsWith("Codex couldn't save diagnostic logs to its local database.")) {
    return {
      code: 'CODEX_DIAGNOSTIC_LOG_WRITE_FAILED',
      message: 'Codex 未能保存部分本机诊断日志。这条告警不代表当前任务失败。若反复出现，请在 Forge 主机上运行 codex doctor 检查。',
    }
  }
  return { code: 'CODEX_APP_SERVER_WARNING', message }
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
