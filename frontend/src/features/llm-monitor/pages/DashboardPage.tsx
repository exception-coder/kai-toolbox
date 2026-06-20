import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Activity, Coins, AlertTriangle, Hash, Timer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { Button } from '@/components/ui/button'
import { cn, formatNumber, formatDuration } from '@/lib/utils'
import {
  fetchSummary,
  fetchTimeseries,
  fetchQuota,
  fetchCalls,
  fetchSlow,
  type GroupBy,
  type Metric,
} from '../lib/api'
import { TrendChart } from '../components/TrendChart'
import { QuotaBars } from '../components/QuotaBars'
import { TraceTable } from '../components/TraceTable'

const REFRESH_MS = 15_000

function money(v: number, currency: string): string {
  const s = v.toFixed(v >= 1 ? 2 : 4)
  return currency === 'CNY' ? `¥${s}` : `${s} ${currency}`
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-muted)] text-[var(--color-primary)]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
          <div className="truncate text-xl font-semibold">{value}</div>
          {hint && <div className="text-[11px] text-[var(--color-muted-foreground)]">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const [groupBy, setGroupBy] = useState<GroupBy>('model')
  const [metric, setMetric] = useState<Metric>('tokens')
  const [traceTab, setTraceTab] = useState<'recent' | 'slow'>('recent')

  const summaryQ = useQuery({
    queryKey: ['llm-monitor', 'summary', groupBy],
    queryFn: () => fetchSummary(groupBy),
    refetchInterval: REFRESH_MS,
  })
  const trendQ = useQuery({
    queryKey: ['llm-monitor', 'timeseries', metric],
    queryFn: () => fetchTimeseries(metric, 'hour'),
    refetchInterval: REFRESH_MS,
  })
  const quotaQ = useQuery({
    queryKey: ['llm-monitor', 'quota'],
    queryFn: fetchQuota,
    refetchInterval: REFRESH_MS,
  })
  const recentQ = useQuery({
    queryKey: ['llm-monitor', 'calls'],
    queryFn: () => fetchCalls({ page: 0, size: 50 }),
    refetchInterval: REFRESH_MS,
    enabled: traceTab === 'recent',
  })
  const slowQ = useQuery({
    queryKey: ['llm-monitor', 'slow'],
    queryFn: () => fetchSlow(20),
    refetchInterval: REFRESH_MS,
    enabled: traceTab === 'slow',
  })

  const totals = summaryQ.data?.totals
  const currency = totals?.currency ?? 'CNY'
  const fetching =
    summaryQ.isFetching || trendQ.isFetching || quotaQ.isFetching || recentQ.isFetching || slowQ.isFetching

  function refreshAll() {
    summaryQ.refetch()
    trendQ.refetch()
    quotaQ.refetch()
    if (traceTab === 'recent') recentQ.refetch()
    else slowQ.refetch()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">LLM 网关监控</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            共享网关全量调用的 token/成本计量、链路追踪与配额水位 · 今日 · 每 15s 自动刷新
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={fetching}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', fetching && 'animate-spin')} />
          刷新
        </Button>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={<Activity className="h-5 w-5" />} label="调用次数" value={formatNumber(totals?.calls ?? 0)} />
        <KpiCard
          icon={<Hash className="h-5 w-5" />}
          label="Token 总量"
          value={formatNumber(totals?.totalTokens ?? 0)}
          hint={`入 ${formatNumber(totals?.inputTokens ?? 0)} · 出 ${formatNumber(totals?.outputTokens ?? 0)}`}
        />
        <KpiCard icon={<Coins className="h-5 w-5" />} label="成本" value={money(totals?.cost ?? 0, currency)} />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="错误率"
          value={`${((totals?.errorRate ?? 0) * 100).toFixed(1)}%`}
        />
        <KpiCard
          icon={<Timer className="h-5 w-5" />}
          label="平均耗时"
          value={formatDuration(totals?.avgLatencyMs ?? 0)}
        />
      </div>

      {/* 趋势 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>趋势（按小时）</CardTitle>
          <Segmented
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'tokens', label: 'Token' },
              { value: 'calls', label: '调用' },
              { value: 'cost', label: '成本' },
              { value: 'errors', label: '错误' },
            ]}
          />
        </CardHeader>
        <CardContent>
          <TrendChart points={trendQ.data?.points ?? []} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 分组明细 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>维度明细</CardTitle>
            <Segmented
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: 'model', label: '模型' },
                { value: 'tier', label: '档位' },
                { value: 'tool', label: '工具' },
              ]}
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
                    <th className="px-2 py-2 font-medium">{groupBy === 'model' ? '模型' : groupBy === 'tier' ? '档位' : '工具'}</th>
                    <th className="px-2 py-2 text-right font-medium">调用</th>
                    <th className="px-2 py-2 text-right font-medium">Token</th>
                    <th className="px-2 py-2 text-right font-medium">成本</th>
                    <th className="px-2 py-2 text-right font-medium">错误率</th>
                  </tr>
                </thead>
                <tbody>
                  {(summaryQ.data?.groups ?? []).map((g) => (
                    <tr key={g.key} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-2 py-2 font-medium">
                        {g.key}
                        {g.tokensEstimatedRatio > 0 && (
                          <span className="ml-1 text-[10px] text-[var(--color-muted-foreground)]">
                            估算 {Math.round(g.tokensEstimatedRatio * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{formatNumber(g.calls)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(g.totalTokens)}</td>
                      <td className="px-2 py-2 text-right">{money(g.cost, currency)}</td>
                      <td className="px-2 py-2 text-right">{(g.errorRate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {(summaryQ.data?.groups ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--color-muted-foreground)]">
                        暂无数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 配额水位 */}
        <Card>
          <CardHeader>
            <CardTitle>配额水位（当日）</CardTitle>
          </CardHeader>
          <CardContent>
            <QuotaBars items={quotaQ.data?.items ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* 调用追踪 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>调用追踪</CardTitle>
          <Segmented
            value={traceTab}
            onChange={setTraceTab}
            options={[
              { value: 'recent', label: '最近' },
              { value: 'slow', label: '慢调用' },
            ]}
          />
        </CardHeader>
        <CardContent>
          <TraceTable rows={traceTab === 'recent' ? recentQ.data?.items ?? [] : slowQ.data ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
