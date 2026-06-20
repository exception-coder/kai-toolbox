import { http } from '@/lib/api'

export interface Totals {
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  currency: string
  errorRate: number
  avgLatencyMs: number
}

export interface GroupStat {
  key: string
  calls: number
  totalTokens: number
  cost: number
  errorRate: number
  avgLatencyMs: number
  tokensEstimatedRatio: number
}

export interface SummaryResult {
  from: string
  to: string
  totals: Totals
  groups: GroupStat[]
}

export interface TsPoint {
  ts: string
  value: number
}

export interface TimeseriesResult {
  bucket: string
  metric: string
  points: TsPoint[]
}

export interface CallRow {
  id: string
  createdAt: string
  epochMs: number
  tier: string
  modelId: string
  modelName: string | null
  toolId: string | null
  agent: string | null
  stage: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  tokensEstimated: boolean
  cost: number
  latencyMs: number
  status: string
  finishReason: string | null
  attempt: number
  errorType: string | null
  errorMessage: string | null
}

export interface PageResult<T> {
  page: number
  size: number
  total: number
  items: T[]
}

export interface QuotaStatus {
  scope: string
  key: string
  tokensUsed: number
  tokenLimit: number | null
  tokenRatio: number | null
  callsUsed: number
  callLimit: number | null
  callRatio: number | null
  softThreshold: number
  state: string
}

export interface QuotaSnapshot {
  window: string
  currency: string
  items: QuotaStatus[]
}

export type GroupBy = 'model' | 'tier' | 'tool'
export type Metric = 'tokens' | 'calls' | 'cost' | 'errors'
export type Bucket = 'hour' | 'day'

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

export function fetchSummary(groupBy: GroupBy, from?: string, to?: string) {
  return http<SummaryResult>(`/llm/monitor/summary${qs({ groupBy, from, to })}`)
}

export function fetchTimeseries(metric: Metric, bucket: Bucket, from?: string, to?: string) {
  return http<TimeseriesResult>(`/llm/monitor/timeseries${qs({ metric, bucket, from, to })}`)
}

export function fetchCalls(params: {
  status?: string
  modelId?: string
  toolId?: string
  page?: number
  size?: number
  from?: string
  to?: string
}) {
  return http<PageResult<CallRow>>(`/llm/monitor/calls${qs(params)}`)
}

export function fetchSlow(limit: number, from?: string, to?: string) {
  return http<CallRow[]>(`/llm/monitor/slow${qs({ limit, from, to })}`)
}

export function fetchQuota() {
  return http<QuotaSnapshot>('/llm/monitor/quota')
}
