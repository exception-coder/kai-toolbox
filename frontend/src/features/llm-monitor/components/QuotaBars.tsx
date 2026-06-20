import { cn, formatNumber } from '@/lib/utils'
import type { QuotaStatus } from '../lib/api'

function barColor(state: string): string {
  switch (state) {
    case 'exceeded':
      return 'bg-[var(--color-destructive)]'
    case 'warn':
      return 'bg-[var(--color-warning-soft-foreground)]'
    default:
      return 'bg-[var(--color-primary)]'
  }
}

function Row({ q }: { q: QuotaStatus }) {
  const tokenPct = q.tokenRatio != null ? Math.min(100, Math.round(q.tokenRatio * 100)) : null
  const callPct = q.callRatio != null ? Math.min(100, Math.round(q.callRatio * 100)) : null
  const unlimited = q.tokenLimit == null && q.callLimit == null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          <span className="text-[var(--color-muted-foreground)]">{q.scope}:</span> {q.key}
        </span>
        {unlimited ? (
          <span className="text-xs text-[var(--color-muted-foreground)]">无限额</span>
        ) : (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {tokenPct != null && `token ${tokenPct}%`}
            {tokenPct != null && callPct != null && ' · '}
            {callPct != null && `调用 ${callPct}%`}
          </span>
        )}
      </div>
      {!unlimited && (
        <>
          {tokenPct != null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div className={cn('h-full rounded-full transition-all', barColor(q.state))} style={{ width: `${tokenPct}%` }} />
            </div>
          )}
          <div className="text-[11px] text-[var(--color-muted-foreground)]">
            token {formatNumber(q.tokensUsed)}
            {q.tokenLimit != null && ` / ${formatNumber(q.tokenLimit)}`}
            {' · '}调用 {formatNumber(q.callsUsed)}
            {q.callLimit != null && ` / ${formatNumber(q.callLimit)}`}
          </div>
        </>
      )}
      {unlimited && (
        <div className="text-[11px] text-[var(--color-muted-foreground)]">
          token {formatNumber(q.tokensUsed)} · 调用 {formatNumber(q.callsUsed)}
        </div>
      )}
    </div>
  )
}

export function QuotaBars({ items }: { items: QuotaStatus[] }) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
        暂无配额/水位数据
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {items.map((q) => (
        <Row key={`${q.scope}:${q.key}`} q={q} />
      ))}
    </div>
  )
}
