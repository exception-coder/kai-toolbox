import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { fetchSubscriptionQuota, type SubscriptionQuota } from '../api'
import type { ClaudeChatSessionView } from '../types'

export type QuotaContext = Pick<ClaudeChatSessionView, 'id' | 'engine' | 'providerKind' | 'codexHome'> & { model?: string | null }

export function SubscriptionQuotaSection({ context }: { context?: QuotaContext }) {
  const query = useQuery({
    queryKey: ['session-subscription-quota', context?.id, context?.engine, context?.providerKind, context?.codexHome, context?.model],
    queryFn: () => fetchSubscriptionQuota(context!.id),
    enabled: Boolean(context?.id), staleTime: 0, retry: false,
  })
  // 不把缓存旧读数当作本次实时获取；正在重新获取时只显示加载状态。
  const quota = !query.isFetching && !query.error ? query.data : undefined
  const available = quota?.available && quota.fetchedAt != null
  const message = !context ? '请先选择一个会话。'
    : query.error ? '请求失败或当前版本尚未支持订阅查询，请重试。'
    : quota?.message ?? '服务商未提供可核验的订阅额度。'
  return <section className="mb-6 border-b border-[var(--color-border)] pb-6" aria-labelledby="subscription-quota-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="subscription-quota-heading" className="text-base font-semibold">订阅剩余额度</h3>
        <p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">当前会话 · {context?.engine ?? '未选择'}{context?.model ? ` · ${context.model}` : ''}</p>
      </div>
      {context && <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-xs disabled:opacity-50 hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        <RefreshCw className="size-3.5" />刷新额度</button>}
    </div>
    {query.isFetching ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]"><Loader2 className="size-4 animate-spin" />正在获取订阅额度…</p>
      : available ? <>
        <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">{quota.shared ? '共享额度' : '服务商配额'}{quota.limitName ? ` · ${quota.limitName}` : ''}{quota.planType ? ` · ${quota.planType}` : ''}</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {[300, 10_080].map(minutes => <QuotaWindow key={minutes} minutes={minutes} window={quota.windows.find(window => window.windowMinutes === minutes)} />)}
          {quota.windows.filter(window => window.windowMinutes !== 300 && window.windowMinutes !== 10_080).map(window => <QuotaWindow key={window.windowMinutes} minutes={window.windowMinutes} window={window} />)}
        </div>
        <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">最后获取：{new Date(quota.fetchedAt!).toLocaleString('zh-CN')} · 服务商实际读数，非本地估算</p>
      </> : <div role={query.error ? 'alert' : undefined} className="mt-5"><p className="text-sm font-medium">暂无法获取</p><p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">{message} 不会使用本地 Token 或费用推算余额。</p></div>}
  </section>
}

function QuotaWindow({ minutes, window }: { minutes: number; window?: SubscriptionQuota['windows'][number] }) {
  const label = minutes === 300 ? '5 小时' : minutes === 10_080 ? '本周' : minutes % 60 === 0 ? `${minutes / 60} 小时` : `${minutes} 分钟`
  return <div><p className="text-xs text-[var(--color-muted-foreground)]">{label}剩余</p>
    {!window ? <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">暂无法获取</p> : <>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{Number(window.remainingPercent.toFixed(2))}%</p>
      <div role="progressbar" aria-label={`${label}剩余额度`} aria-valuenow={window.remainingPercent} aria-valuemin={0} aria-valuemax={100}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]"><div className={window.remainingPercent <= 10 ? 'h-full bg-rose-500' : 'h-full bg-[var(--color-primary)]'} style={{ width: `${window.remainingPercent}%` }} /></div>
      <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">{window.resetsAt ? `${new Date(window.resetsAt * 1000).toLocaleString('zh-CN')} 重置` : '重置时间暂无法获取'}</p>
    </>}
  </div>
}
