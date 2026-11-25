import { useEffect, useState } from 'react'
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { fetchCodexHomes, fetchSubscriptionQuota, type SubscriptionQuota } from '../api'
import type { ClaudeChatSessionView, Engine, EngineCatalogView } from '../types'
import { subscriptionQuotaRows, type QuotaAccountRow } from '../lib/subscriptionQuotaRows'
import { formatPercent, orderedWindows, quotaState, quotaSummary, quotaWindowLabel, type QuotaState } from '../lib/quotaStatus'
import { EngineIcon } from './EngineIcon'

export type QuotaContext = Pick<ClaudeChatSessionView, 'id' | 'engine' | 'providerKind' | 'providerBaseUrl' | 'codexHome'> & { model?: string | null }

interface EngineGroup { engine: Engine; label: string; rows: QuotaAccountRow[] }

/** 额度结果一分钟内复用，展开、重开面板不重复请求；手动刷新才强制重新获取。 */
const QUOTA_CACHE_MS = 60_000

/**
 * 服务商订阅额度：按引擎与账号来源分组，当前引擎展开，其余默认折叠且展开时才查询。
 * 只展示服务商真实返回的窗口；API 计费只标「按量计费」，无额度接口的引擎不占卡片。
 */
export function SubscriptionQuotaSection({ context, sessions = [], catalog }: {
  context?: QuotaContext; sessions?: readonly ClaudeChatSessionView[]; catalog?: EngineCatalogView
}) {
  const { user } = useAuth()
  const sources = context && !sessions.some(session => session.id === context.id)
    ? [...sessions, { ...context, lastSeenAt: 0 } as ClaudeChatSessionView] : sessions
  const needsCodexHomes = sources.some(session => session.engine === 'codex' && session.providerKind !== 'thirdParty')
  const codexHomes = useQuery({
    queryKey: ['claude-chat-codex-homes'], queryFn: fetchCodexHomes,
    enabled: needsCodexHomes, staleTime: QUOTA_CACHE_MS, retry: false, refetchOnWindowFocus: false,
  })
  const rows = subscriptionQuotaRows(sources, context?.id, catalog, codexHomes.isSuccess ? codexHomes.data : undefined)
  const currentRow = rows.find(row => row.current)
  const currentEngine = context?.engine ?? currentRow?.engine
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [otherEnginesOpen, setOtherEnginesOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), QUOTA_CACHE_MS)
    return () => window.clearInterval(timer)
  }, [])
  const isOpen = (row: QuotaAccountRow) => row.current || (row.engine === currentEngine
    ? expanded.has(row.engine) : otherEnginesOpen && expanded.has(row.engine))
  const queries = useQueries({ queries: rows.map(row => ({
    queryKey: ['session-subscription-quota', user?.userId, row.key, row.engine === 'codex' ? row.sessionId : undefined, row.engine === 'codex' && row.current ? context?.model : undefined],
    queryFn: () => fetchSubscriptionQuota(row.sessionId!),
    enabled: row.billing === 'subscription' && Boolean(row.sessionId) && isOpen(row)
      && (row.engine !== 'codex' || !codexHomes.isPending),
    staleTime: QUOTA_CACHE_MS, retry: false, refetchOnWindowFocus: false,
  })) })
  const queryOf = (row: QuotaAccountRow) => queries[rows.indexOf(row)]
  const refreshing = codexHomes.isFetching || queries.some(query => query.isFetching)
  const refreshExpanded = () => {
    if (needsCodexHomes) void codexHomes.refetch()
    rows.forEach((row, index) => { if (row.billing === 'subscription' && isOpen(row) && (row.engine !== 'codex' || !codexHomes.isPending)) void queries[index].refetch() })
  }

  const groups: EngineGroup[] = []
  for (const row of rows) {
    const group = groups.find(item => item.engine === row.engine)
    if (group) group.rows.push(row)
    else groups.push({ engine: row.engine, label: row.label, rows: [row] })
  }
  const visible = (group: EngineGroup) => group.rows.some(row => row.billing === 'subscription' || row.billing === 'metered')
  const current = groups.find(group => group.engine === currentEngine)
  const others = groups.filter(group => group !== current && visible(group))
  const withoutQuota = groups.filter(group => group !== current && !visible(group))
  const otherAccounts = current?.rows.filter(row => !row.current && (row.billing === 'subscription' || row.billing === 'metered')) ?? []
  const toggle = (engine: Engine) => setExpanded(previous => {
    const next = new Set(previous)
    if (next.has(engine)) next.delete(engine)
    else next.add(engine)
    return next
  })

  return <section aria-labelledby="subscription-quota-heading" className="border-b border-[var(--color-border)] pb-4">
    <div className="flex min-w-0 items-center gap-2">
      <h3 id="subscription-quota-heading" className="text-sm font-semibold">服务商订阅额度</h3>
      <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">按账号，不随日期变化</span>
    </div>
    {refreshing && <p role="status" className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />正在获取订阅额度…</p>}

    {current && <div className="mt-2 rounded-lg border border-[var(--color-border)] p-3" aria-label={`当前引擎 ${current.label}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <EngineIcon engine={current.engine} className="size-4 shrink-0" />
        <span className="truncate text-sm font-semibold">{current.label}</span>
        <span className="shrink-0 rounded bg-[var(--color-primary)]/10 px-1.5 text-[10px] font-medium text-[var(--color-primary)]">当前</span>
      </div>
      <div className="mt-2 divide-y divide-[var(--color-border)]">
        {currentRow ? <AccountQuota key={currentRow.key} row={currentRow} query={queryOf(currentRow)} now={now} />
          : <p className="py-1 text-xs text-muted-foreground">{current.rows[0]?.reason ?? '当前会话未关联额度账号'}</p>}
        {otherAccounts.length > 0 && <div className="pt-1">
          <button type="button" aria-expanded={expanded.has(current.engine)} onClick={() => toggle(current.engine)} className="min-h-10 text-xs text-muted-foreground hover:text-foreground">同引擎其他账号 · {otherAccounts.length}</button>
          {expanded.has(current.engine) && otherAccounts.map(row => <AccountQuota key={row.key} row={row} query={queryOf(row)} now={now} />)}
        </div>}
      </div>
    </div>}

    {others.length > 0 && <div className="mt-2">
      <button type="button" onClick={() => setOtherEnginesOpen(open => !open)} aria-expanded={otherEnginesOpen} className="min-h-10 text-xs text-muted-foreground hover:text-foreground">其他引擎 · {others.length}</button>
      {otherEnginesOpen && <ul className="divide-y rounded-lg border">
        {others.map(group => {
          const open = expanded.has(group.engine)
          const accounts = group.rows.filter(row => row.billing === 'subscription' || row.billing === 'metered')
          const summary = accounts.length === 1 ? quotaSummary(quotaState(accounts[0], queryOf(accounts[0]), now))
            : `${accounts.length} 个账号`
          return <li key={group.engine}>
            <button type="button" aria-expanded={open} onClick={() => toggle(group.engine)} className="flex min-h-11 w-full min-w-0 items-center gap-2 px-3 text-left hover:bg-[var(--color-muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]">
              <EngineIcon engine={group.engine} className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{group.label}</span>
              <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--color-muted-foreground)]">{summary}</span>
              <ChevronRight className={cn('size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform', open && 'rotate-90')} />
            </button>
            {open && <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] px-3">
              {accounts.map(row => <AccountQuota key={row.key} row={row} query={queryOf(row)} now={now} />)}
            </div>}
          </li>
        })}
      </ul>}
    </div>}

    <details className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">
      <summary className="w-fit cursor-pointer select-none hover:text-[var(--color-foreground)]">额度说明{withoutQuota.length ? ` · ${withoutQuota.length} 个引擎无订阅额度` : ''}</summary>
      <div className="mt-1.5 space-y-1 leading-relaxed">
        <p>额度来自各引擎服务商接口，按已加载会话及仍存在的授权目录汇总；同一账号来源只查询一次。不同账号的百分比不合计，服务商未返回的窗口不估算。</p>
        {withoutQuota.length > 0 && <p>无订阅额度：{withoutQuota.map(group => group.label).join('、')}。</p>}
        {codexHomes.isError && <p role="status">Codex 授权目录核验失败，暂按历史会话显示；可点击刷新重试。</p>}
        <button type="button" disabled={refreshing} onClick={refreshExpanded} className="min-h-10 text-xs underline">刷新已展开的额度</button>
      </div>
    </details>
  </section>
}

function AccountQuota({ row, query, now }: { row: QuotaAccountRow; query?: UseQueryResult<SubscriptionQuota>; now: number }) {
  const state = quotaState(row, query, now)
  return <article aria-label={`${row.label} · ${row.account}`} className="min-w-0 py-2">
    <div className="flex min-w-0 items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-xs" title={row.account}>
        <span className="font-medium">{row.account}</span>
        {(state.kind === 'ok' || state.kind === 'stale') && state.quota.planType ? <span className="text-[var(--color-muted-foreground)]"> · {state.quota.planType}</span> : null}
      </p>
      <StatusBadge state={state} />
    </div>
    {(state.kind === 'ok' || state.kind === 'stale') && <>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-2">
        {orderedWindows(state.quota).slice(0, 2).map((window, index) => <QuotaWindow key={index} window={window} />)}
      </div>
      <p className="mt-1.5 truncate text-[10px] text-[var(--color-muted-foreground)]">
        {state.quota.shared ? '共享额度' : '服务商配额'}{state.quota.limitName ? ` · ${state.quota.limitName}` : ''} · 更新于 {new Date(state.quota.fetchedAt!).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </p>
    </>}
    {row.billing === 'subscription' && state.kind !== 'metered' && state.kind !== 'loading' && query && <details className="mt-1 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer select-none">{state.kind === 'failed' ? '查看失败原因' : '账号额度详情'}</summary>
      {(state.kind === 'failed' || state.kind === 'empty') && <p className="mt-1 [overflow-wrap:anywhere]">{state.reason}</p>}
      {(state.kind === 'ok' || state.kind === 'stale') && state.refreshError && <p className="mt-1 [overflow-wrap:anywhere]">{state.refreshError}</p>}
      {(state.kind === 'ok' || state.kind === 'stale') && <ul className="space-y-1 py-1">
        {orderedWindows(state.quota).map((window, index) => <li key={index} className="flex flex-wrap justify-between gap-x-2">
          <span>{quotaWindowLabel(window.windowMinutes)}剩余 {formatPercent(window.remainingPercent)}</span>
          <span>{window.resetsAt ? `${new Date(window.resetsAt * 1000).toLocaleString('zh-CN')} 重置` : '重置时间未返回'}</span>
        </li>)}
      </ul>}
      <button type="button" aria-label={`刷新 ${row.label} ${row.account} 额度`} disabled={query.isFetching} onClick={() => void query.refetch()}
        className="inline-flex min-h-10 items-center gap-1.5 underline"><RefreshCw className="size-3" />刷新此账号</button>
    </details>}
  </article>
}

function StatusBadge({ state }: { state: QuotaState }) {
  const base = 'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium'
  switch (state.kind) {
    case 'loading': return null
    case 'ok': return <span className={cn(base, 'text-muted-foreground')}>{state.refreshError ? '刷新失败' : '已获取'}</span>
    case 'stale': return <span className={cn(base, 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>数据过期</span>
    case 'failed': return <span className={cn(base, 'bg-red-500/10 text-red-700 dark:text-red-300')}>获取失败</span>
    case 'empty': return <span className={cn(base, 'text-[var(--color-muted-foreground)]')}>未返回窗口</span>
    case 'metered': return <span className={cn(base, 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]')}>按量计费</span>
    case 'unsupported': return <span className={cn(base, 'text-[var(--color-muted-foreground)]')}>不提供</span>
    case 'idle': return null
  }
}

function QuotaWindow({ window }: { window: SubscriptionQuota['windows'][number] }) {
  const label = quotaWindowLabel(window.windowMinutes)
  const reset = window.resetsAt
    ? new Date(window.resetsAt * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null
  return <div className="min-w-0">
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">{label}剩余</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPercent(window.remainingPercent)}</span>
    </div>
    <div role="progressbar" aria-label={`${label}剩余额度`} aria-valuenow={window.remainingPercent} aria-valuemin={0} aria-valuemax={100}
      className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
      <div className={cn('h-full', window.remainingPercent < 15 ? 'bg-red-500' : window.remainingPercent < 35 ? 'bg-amber-500' : 'bg-[var(--color-primary)]')}
        style={{ width: `${Math.max(0, Math.min(100, window.remainingPercent))}%` }} />
    </div>
    {reset && <p className="mt-0.5 truncate text-[10px] text-[var(--color-muted-foreground)]">{reset} 重置</p>}
  </div>
}
