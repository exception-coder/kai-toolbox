import type { SubscriptionQuota } from '../api'
import type { QuotaAccountRow } from './subscriptionQuotaRows'

/** 超过该时长的成功结果标记为过期，提示可刷新；不自动丢弃数据。 */
export const QUOTA_STALE_MS = 10 * 60_000

export type QuotaState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok' | 'stale'; quota: SubscriptionQuota; refreshing: boolean }
  | { kind: 'failed'; reason: string }
  | { kind: 'empty'; reason: string }
  | { kind: 'metered' }
  | { kind: 'unsupported'; reason: string }

export interface QuotaQueryLike {
  data?: SubscriptionQuota
  error: unknown
  isFetching: boolean
  fetchStatus?: string
}

/** 一个账号只有一个状态；刷新时保留上次成功结果，不回退成「获取中」。 */
export function quotaState(row: QuotaAccountRow, query: QuotaQueryLike | undefined, now = Date.now()): QuotaState {
  if (row.billing === 'metered') return { kind: 'metered' }
  if (row.billing !== 'subscription') return { kind: 'unsupported', reason: row.reason ?? '此引擎不提供订阅额度' }
  if (!query) return { kind: 'idle' }
  const data = query.data
  if (data?.available && data.fetchedAt != null && data.windows.length > 0) {
    return { kind: now - data.fetchedAt > QUOTA_STALE_MS ? 'stale' : 'ok', quota: data, refreshing: query.isFetching }
  }
  if (query.isFetching) return { kind: 'loading' }
  if (query.error) return { kind: 'failed', reason: query.error instanceof Error && query.error.message ? query.error.message : '请求失败，或服务尚未加载额度接口' }
  if (data && !data.available) return { kind: 'failed', reason: data.message || '服务商未返回额度' }
  if (data) return { kind: 'empty', reason: data.message || '服务商未返回额度窗口' }
  return { kind: 'idle' }
}

/** 窗口名称按服务商返回的时长描述，只把 300 分钟和 10080 分钟称为「5 小时」「本周」。 */
export function quotaWindowLabel(minutes: number): string {
  if (minutes === 300) return '5 小时'
  if (minutes === 10_080) return '本周'
  if (minutes < 60) return `${minutes} 分钟`
  if (minutes < 1_440) return `${Number((minutes / 60).toFixed(1))} 小时`
  return `${Number((minutes / 1_440).toFixed(1))} 天`
}

/** 5 小时、本周优先，其余窗口按时长排序。 */
export function orderedWindows(quota: SubscriptionQuota) {
  const rank = (minutes: number) => minutes === 300 ? 0 : minutes === 10_080 ? 1 : 2
  return [...quota.windows].sort((a, b) => rank(a.windowMinutes) - rank(b.windowMinutes) || a.windowMinutes - b.windowMinutes)
}

export function formatPercent(value: number): string {
  return `${Number(value.toFixed(1))}%`
}

/** 折叠行的一句话摘要：成功时给最短窗口剩余，不合计不同账号。 */
export function quotaSummary(state: QuotaState): string {
  switch (state.kind) {
    case 'ok':
    case 'stale': {
      const first = orderedWindows(state.quota)[0]
      return `${quotaWindowLabel(first.windowMinutes)} ${formatPercent(first.remainingPercent)}${state.kind === 'stale' ? ' · 已过期' : ''}`
    }
    case 'loading': return '查询中'
    case 'failed': return '获取失败'
    case 'empty': return '未返回窗口'
    case 'metered': return '按量计费'
    case 'unsupported': return '不提供'
    case 'idle': return '展开查看'
  }
}
