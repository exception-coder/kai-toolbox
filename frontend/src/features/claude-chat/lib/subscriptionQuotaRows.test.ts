import { describe, expect, it } from 'vitest'
import type { ClaudeChatSessionView, EngineCatalogView } from '../types'
import { subscriptionQuotaRows } from './subscriptionQuotaRows'

const session = (id: string, codexHome?: string, extra = {}): ClaudeChatSessionView => ({
  id, codexHome, engine: 'codex', providerKind: 'official', cwd: '.', title: id,
  sdkSessionId: null, lastSeenAt: 1, startedAt: 1, status: 'IDLE', live: false, ...extra,
})

describe('引擎账号汇总', () => {
  it('同目录合并，共享计数，当前会话作为代表且优先', () => {
    const sources = [session('old', 'C:\\Users\\u\\.codex'), session('other', 'C:/Users/u/.codex-pro'), session('current', 'c:/users/u/.codex/')]
    const rows = subscriptionQuotaRows(sources, 'current').filter(row => row.engine === 'codex')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ sessionId: 'current', current: true, sessionCount: 2 })
    expect(sources[0].id).toBe('old')
  })
  it('不同账号来源分开，Unix大小写保持区分', () => {
    const rows = subscriptionQuotaRows([session('a', '/home/u/.codex'), session('b', '/home/U/.codex')])
    expect(rows.filter(row => row.queryable)).toHaveLength(2)
  })
  it('展示所有登记引擎，不给第三方或无适配接口的引擎发查询', () => {
    const rows = subscriptionQuotaRows([session('a', undefined, { providerKind: 'thirdParty' }), session('p', undefined, { engine: 'pi' })])
    expect(new Set(rows.map(row => row.engine)).size).toBe(9)
    expect(rows.filter(row => row.queryable)).toHaveLength(0)
    expect(rows.find(row => row.engine === 'pi')?.reason).toContain('尚无已核验')
  })
  it('尊重权威目录，保留已加载会话的其他历史引擎', () => {
    const catalog: EngineCatalogView = { protocolVersion: 1, engines: [{ id: 'codex', displayName: 'Codex', capabilities: [], selectable: true, availability: 'stable', probe: { status: 'ready' } }] }
    const rows = subscriptionQuotaRows([session('a', undefined, { engine: 'claude' })], undefined, catalog)
    expect(rows.map(row => row.engine)).toEqual(['codex', 'claude'])
    expect(rows[1].queryable).toBe(true)
  })
})
