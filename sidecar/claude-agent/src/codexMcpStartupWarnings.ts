type RecordValue = Record<string, unknown>

const record = (value: unknown): RecordValue | undefined =>
  value !== null && typeof value === 'object' ? value as RecordValue : undefined
const text = (value: unknown): string => typeof value === 'string' ? value : ''

/** One instance per turn: retries cannot flood the transcript; a confirmed recovery permits a new warning. */
export class CodexMcpStartupWarnings {
  private readonly failures = new Map<string, Set<string>>()

  accept(params: RecordValue): { server: string; reason: string; message: string } | undefined {
    const nested = record(params.status)
    const server = text(params.serverName) || text(params.name) || text(nested?.name) || 'MCP'
    const status = text(nested?.status) || text(nested?.state) || text(params.status)
    if (/^(ready|completed|connected)$/i.test(status)) {
      this.failures.delete(server)
      return undefined
    }
    if (!/^(failed|error|unavailable)$/i.test(status)) return undefined

    const error = nested?.error ?? params.error
    const detail = text(error) || text(record(error)?.message)
      || text(nested?.message) || text(params.message)
      || text(nested?.failureReason) || text(params.failureReason)
    const reason = /challenge|captcha/i.test(detail) ? 'challenge'
      : /\b403\b/.test(detail) ? 'forbidden'
      : /timed?\s*out|timeout/i.test(detail) ? 'timeout' : 'unavailable'
    const seen = this.failures.get(server) ?? new Set<string>()
    if (seen.has(reason)) return undefined
    seen.add(reason)
    this.failures.set(server, seen)

    const explanation = reason === 'challenge' ? '远端要求验证挑战，工具连接被拒绝'
      : reason === 'forbidden' ? '远端拒绝访问（HTTP 403）'
      : reason === 'timeout' ? '连接超时' : '初始化失败'
    // Do not copy untrusted transport JSON, request identifiers or possible credentials into chat.
    const name = server.replace(/[\r\n\t]/g, ' ').slice(0, 80)
    const recovery = server === 'openaiDeveloperDocs'
      ? '需要文档时可直接访问 OpenAI 官方文档；稍后重试工具连接。'
      : '请检查该工具配置与网络后重试。'
    return { server: name, reason, message: `${name} 暂不可用：${explanation}。本轮无法使用该工具。${recovery}` }
  }
}
