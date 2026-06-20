import { Badge } from '@/components/ui/badge'
import { formatDate, formatDuration, formatNumber } from '@/lib/utils'
import type { CallRow } from '../lib/api'

function statusBadge(status: string) {
  switch (status) {
    case 'success':
      return <Badge variant="success">成功</Badge>
    case 'error':
      return <Badge variant="destructive">失败</Badge>
    case 'quota_blocked':
      return <Badge variant="warning">配额拒绝</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export function TraceTable({ rows }: { rows: CallRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">暂无调用记录</div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
            <th className="px-2 py-2 font-medium">时间</th>
            <th className="px-2 py-2 font-medium">状态</th>
            <th className="px-2 py-2 font-medium">模型 / tier</th>
            <th className="px-2 py-2 font-medium">归因</th>
            <th className="px-2 py-2 text-right font-medium">token</th>
            <th className="px-2 py-2 text-right font-medium">耗时</th>
            <th className="px-2 py-2 text-center font-medium">#</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
              <td className="whitespace-nowrap px-2 py-2 text-[var(--color-muted-foreground)]">
                {formatDate(r.epochMs)}
              </td>
              <td className="px-2 py-2">{statusBadge(r.status)}</td>
              <td className="px-2 py-2">
                <div className="font-medium">{r.modelName ?? r.modelId}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">{r.tier}</div>
                {r.status === 'error' && r.errorType && (
                  <div className="mt-0.5 max-w-[280px] truncate text-xs text-[var(--color-destructive)]" title={r.errorMessage ?? r.errorType}>
                    {r.errorType.replace(/^.*\./, '')}
                  </div>
                )}
              </td>
              <td className="px-2 py-2 text-xs text-[var(--color-muted-foreground)]">
                {r.toolId ?? '—'}
                {r.agent && <span> · {r.agent}</span>}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right">
                {r.totalTokens != null ? formatNumber(r.totalTokens) : '—'}
                {r.tokensEstimated && (
                  <span className="ml-1 text-[10px] text-[var(--color-muted-foreground)]">估</span>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right">{formatDuration(r.latencyMs)}</td>
              <td className="px-2 py-2 text-center text-xs text-[var(--color-muted-foreground)]">{r.attempt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
