import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { fetchSubscriptionQuota, type SubscriptionQuota } from '../api'
import type { ClaudeChatSessionView, EngineCatalogView } from '../types'
import { subscriptionQuotaRows, type QuotaAccountRow } from '../lib/subscriptionQuotaRows'
import { EngineIcon } from './EngineIcon'

export type QuotaContext = Pick<ClaudeChatSessionView, 'id' | 'engine' | 'providerKind' | 'codexHome'> & { model?: string | null }

export function SubscriptionQuotaSection({ context, sessions = [], catalog }: {
  context?: QuotaContext; sessions?: readonly ClaudeChatSessionView[]; catalog?: EngineCatalogView
}) {
  const sources = context && !sessions.some(session => session.id === context.id)
    ? [...sessions, { ...context, lastSeenAt: 0 } as ClaudeChatSessionView] : sessions
  const rows = subscriptionQuotaRows(sources, context?.id, catalog)
  const queries = useQueries({ queries: rows.map(row => ({
    queryKey: ['session-subscription-quota', row.key, row.sessionId, row.current ? context?.model : undefined],
    queryFn: () => fetchSubscriptionQuota(row.sessionId!), enabled: row.queryable && Boolean(row.sessionId),
    staleTime: 0, retry: false,
  })) })
  const loading = queries.some(query => query.isFetching)
  const readable = queries.filter(query => query.data?.available && !query.error && !query.isFetching).length
  return <section className="mb-5 border-b border-[var(--color-border)] pb-5" aria-labelledby="subscription-quota-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="subscription-quota-heading" className="text-sm font-semibold">订阅额度汇总</h3>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{new Set(rows.map(row => row.engine)).size} 个引擎 · {readable} 个账号来源可读取 · 剩余额度</p>
      </div>
      <button type="button" disabled={loading || !rows.some(row => row.queryable)}
        onClick={() => { queries.forEach((query, index) => { if (rows[index].queryable) void query.refetch() }) }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-xs disabled:opacity-50 hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />刷新全部</button>
    </div>
    <div className="mt-3 hidden grid-cols-[minmax(10rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-[var(--color-border)] pb-2 text-[11px] text-[var(--color-muted-foreground)] sm:grid" aria-hidden="true">
      <span>引擎 / 账号</span><span>5 小时剩余</span><span>本周剩余</span>
    </div>
    <div className="divide-y divide-[var(--color-border)]">{rows.map((row, index) => <AccountQuotaRow key={row.key} row={row} query={queries[index]} />)}</div>
    <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">按已加载会话的账号配置来源汇总；同源共享额度只展示一次。不同账号百分比不合计，未返回对应窗口不估算。</p>
  </section>
}

function AccountQuotaRow({ row, query }: { row: QuotaAccountRow; query: UseQueryResult<SubscriptionQuota> }) {
  const quota = !query.isFetching && !query.error && query.data?.available && query.data.fetchedAt != null ? query.data : undefined
  const message = row.reason ?? (query.error ? '请求失败，或服务尚未加载额度接口' : query.data?.message)
  const loading = query.isFetching
  return <article aria-label={`${row.label} · ${row.account}`} className="py-3">
    <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2 sm:grid-cols-[minmax(10rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex flex-wrap items-center gap-1.5"><EngineIcon engine={row.engine} className="size-3.5 shrink-0" /><h4 className="text-xs font-semibold">{row.label}</h4>
          {row.current && <span className="text-[10px] font-medium text-[var(--color-primary)]">当前</span>}
          {row.queryable && <button type="button" aria-label={`刷新 ${row.label} ${row.account} 额度`} disabled={loading} onClick={() => void query.refetch()} className="ml-auto rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"><RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} /></button>}
        </div>
        <p className="mt-1 break-all text-[11px] text-[var(--color-muted-foreground)]">{row.account}{quota?.planType ? ` · ${quota.planType}` : ''}{row.sessionCount > 1 ? ` · ${row.sessionCount} 会话` : ''}</p>
        {quota && <p className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">{quota.shared ? '共享额度' : '服务商配额'}{quota.limitName ? ` · ${quota.limitName}` : ''}</p>}
      </div>
      {[300, 10_080].map(minutes => <QuotaWindow key={minutes} minutes={minutes} loading={loading} window={quota?.windows.find(window => window.windowMinutes === minutes)} />)}
    </div>
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">
      {loading ? <span role="status" className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />正在获取…</span>
        : quota ? <>
          <span>最后获取：{new Date(quota.fetchedAt!).toLocaleString('zh-CN')}</span>
          {quota.windows.filter(window => ![300, 10_080].includes(window.windowMinutes)).map(window => <span key={window.windowMinutes}>{window.windowMinutes} 分钟窗口剩余 {Number(window.remainingPercent.toFixed(2))}%</span>)}
        </> : <span role={query.error ? 'alert' : undefined}>{message ?? '暂无法获取'}</span>}
    </div>
  </article>
}

function QuotaWindow({ minutes, window, loading }: { minutes: number; window?: SubscriptionQuota['windows'][number]; loading: boolean }) {
  const label = minutes === 300 ? '5 小时' : '本周'
  return <div className="min-w-0"><p className="mb-1 text-[10px] text-[var(--color-muted-foreground)] sm:hidden">{label}剩余</p>
    {loading ? <span className="text-xs text-[var(--color-muted-foreground)]">获取中</span> : !window ? <span className="text-xs text-[var(--color-muted-foreground)]">暂无法获取</span> : <>
      <p className="text-base font-semibold tabular-nums tracking-tight">{Number(window.remainingPercent.toFixed(2))}%</p>
      <div role="progressbar" aria-label={`${label}剩余额度`} aria-valuenow={window.remainingPercent} aria-valuemin={0} aria-valuemax={100}
        className="mt-1 h-1 max-w-48 overflow-hidden rounded-full bg-[var(--color-muted)]"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${window.remainingPercent}%` }} /></div>
      <p className="mt-1 break-words text-[10px] text-[var(--color-muted-foreground)]">{window.resetsAt ? `${new Date(window.resetsAt * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 重置` : '重置时间暂无法获取'}</p>
    </>}
  </div>
}
