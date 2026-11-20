import { describe, expect, it } from 'vitest'
import type { SubscriptionQuota } from '../api'
import type { QuotaAccountRow } from './subscriptionQuotaRows'
import { QUOTA_STALE_MS, quotaState, quotaSummary, quotaWindowLabel } from './quotaStatus'

const row = (billing: QuotaAccountRow['billing'], extra: Partial<QuotaAccountRow> = {}): QuotaAccountRow => ({
  key: 'k', billing, engine: 'codex', label: 'Codex', account: 'home', current: true, sessionCount: 1, queryable: billing === 'subscription', ...extra,
})
const quota = (fetchedAt: number, extra: Partial<SubscriptionQuota> = {}): SubscriptionQuota => ({
  available: true, shared: false, fetchedAt, windows: [{ windowMinutes: 10_080, remainingPercent: 40, resetsAt: null }, { windowMinutes: 300, remainingPercent: 72.25, resetsAt: null }], ...extra,
})
const now = 1_000_000_000

describe('额度状态', () => {
  it('计费类型优先于查询结果', () => {
    expect(quotaState(row('metered'), undefined).kind).toBe('metered')
    expect(quotaState(row('unsupported', { reason: '无接口' }), undefined)).toEqual({ kind: 'unsupported', reason: '无接口' })
  })

  it('区分未查询、获取中、成功、过期、失败与未返回窗口', () => {
    expect(quotaState(row('subscription'), undefined).kind).toBe('idle')
    expect(quotaState(row('subscription'), { error: null, isFetching: true }).kind).toBe('loading')
    expect(quotaState(row('subscription'), { data: quota(now), error: null, isFetching: false }, now).kind).toBe('ok')
    expect(quotaState(row('subscription'), { data: quota(now - QUOTA_STALE_MS - 1), error: null, isFetching: false }, now).kind).toBe('stale')
    expect(quotaState(row('subscription'), { error: new Error('超时'), isFetching: false })).toEqual({ kind: 'failed', reason: '超时' })
    expect(quotaState(row('subscription'), { data: quota(now, { available: false, message: '未登录' }), error: null, isFetching: false })).toEqual({ kind: 'failed', reason: '未登录' })
    expect(quotaState(row('subscription'), { data: quota(now, { windows: [] }), error: null, isFetching: false }, now).kind).toBe('empty')
  })

  it('刷新中保留上次成功结果，不回退为获取中', () => {
    const state = quotaState(row('subscription'), { data: quota(now), error: null, isFetching: true }, now)
    expect(state).toMatchObject({ kind: 'ok', refreshing: true })
  })

  it('窗口命名与折叠摘要只使用服务商返回的数据', () => {
    expect([300, 10_080, 15, 90, 2_880].map(quotaWindowLabel)).toEqual(['5 小时', '本周', '15 分钟', '1.5 小时', '2 天'])
    expect(quotaSummary(quotaState(row('subscription'), { data: quota(now), error: null, isFetching: false }, now))).toBe('5 小时 72.3%')
    expect(quotaSummary({ kind: 'metered' })).toBe('按量计费')
  })
})
