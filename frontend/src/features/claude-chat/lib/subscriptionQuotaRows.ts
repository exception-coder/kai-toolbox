import type { ClaudeChatSessionView, Engine, EngineCatalogView } from '../types'

export interface QuotaAccountRow {
  key: string
  engine: Engine
  label: string
  account: string
  sessionId?: string
  current: boolean
  sessionCount: number
  queryable: boolean
  reason?: string
}

const LABELS: Record<Engine, string> = {
  claude: 'Claude Code', codex: 'Codex', qwen: 'Qwen Code', opencode: 'OpenCode',
  pi: 'Pi', copilot: 'GitHub Copilot', trae: 'Trae', antigravity: 'Antigravity', deepseekHarness: 'DeepSeek Harness',
}

/** 配置来源去重，不宣称不同目录必然是不同身份，更不合计跨账号百分比。 */
export function subscriptionQuotaRows(
  sessions: readonly ClaudeChatSessionView[], currentId?: string, catalog?: EngineCatalogView,
): QuotaAccountRow[] {
  const engines = [...new Set<Engine>([
    ...(catalog?.engines.map(entry => entry.id) ?? Object.keys(LABELS) as Engine[]),
    ...sessions.map(session => session.engine ?? 'claude'),
  ])]
  const rows: QuotaAccountRow[] = []
  for (const engine of engines) {
    const label = catalog?.engines.find(entry => entry.id === engine)?.displayName ?? LABELS[engine]
    const matching = sessions.filter(session => (session.engine ?? 'claude') === engine)
      .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || b.lastSeenAt - a.lastSeenAt)
    const accounts = new Map<string, QuotaAccountRow>()
    for (const session of matching) {
      const thirdParty = session.providerKind === 'thirdParty'
      const home = engine === 'codex' ? session.codexHome?.trim() || '' : ''
      const source = home.replaceAll('\\', '/').replace(/\/$/, '')
      const normalized = /^[a-z]:\//i.test(source) ? source.toLowerCase() : source
      const key = thirdParty ? `${engine}:api` : `${engine}:official:${normalized}`
      const existing = accounts.get(key)
      if (existing) { existing.sessionCount++; continue }
      const supported = engine === 'claude' || engine === 'codex'
      accounts.set(key, {
        key, engine, label, account: thirdParty ? '第三方 / API 计费' : home.split(/[\\/]/).filter(Boolean).at(-1) || '默认官方账号',
        sessionId: session.id, current: session.id === currentId, sessionCount: 1,
        queryable: !thirdParty && supported,
        reason: thirdParty ? 'API 计费不提供订阅窗口' : !supported ? '此引擎尚无已核验的对应额度接口' : undefined,
      })
    }
    if (!accounts.size) rows.push({ key: `${engine}:none`, engine, label, account: '未绑定会话账号', current: false, sessionCount: 0, queryable: false, reason: '请先为该引擎建立会话' })
    else rows.push(...accounts.values())
  }
  return rows.sort((a, b) => Number(b.current) - Number(a.current))
}
