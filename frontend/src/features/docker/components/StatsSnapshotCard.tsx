import { useMutation } from '@tanstack/react-query'
import { Activity, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { getStats } from '../api'
import type { ContainerStatsResponse } from '../types'

interface Props { hostId: string }

export function StatsSnapshotCard({ hostId }: Props) {
  const snapshot = useMutation({
    mutationFn: (nocache: boolean) => getStats(hostId, nocache),
  })

  const data: ContainerStatsResponse | undefined = snapshot.data
  const err = snapshot.error ? toMsg(snapshot.error) : null

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="size-4" /> 资源快照
          {data && (
            <span className="text-[11px] text-muted-foreground font-normal">
              {new Date(data.snapshotAt).toLocaleString()}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={snapshot.isPending}
                  onClick={() => snapshot.mutate(false)}>
            <Activity className="size-3.5" /> 拍快照
          </Button>
          <Button size="sm" variant="ghost" disabled={snapshot.isPending}
                  onClick={() => snapshot.mutate(true)}>
            <RefreshCw className="size-3.5" /> 强制刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {err && (
          <div className="mb-2 text-xs text-red-500 border border-red-300 rounded px-2 py-1">{err}</div>
        )}
        {!data ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            尚未拍快照。docker stats --no-stream 较慢（典型 2-5s），按需触发
          </div>
        ) : data.items.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">无运行中容器</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-1.5 pl-2 font-normal">容器</th>
                <th className="text-right py-1.5 font-normal">CPU %</th>
                <th className="text-right py-1.5 font-normal">内存</th>
                <th className="text-right py-1.5 font-normal">内存 %</th>
                <th className="text-right py-1.5 font-normal">Net I/O</th>
                <th className="text-right py-1.5 pr-2 font-normal">Block I/O</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(it => (
                <tr key={it.id} className="border-b last:border-b-0">
                  <td className="py-1 pl-2 font-mono text-[11px]">{it.name}</td>
                  <td className="py-1 text-right">{it.cpuPercent.toFixed(2)}</td>
                  <td className="py-1 text-right">
                    {fmtBytes(it.memUsageBytes)} / {fmtBytes(it.memLimitBytes)}
                  </td>
                  <td className="py-1 text-right">{it.memPercent.toFixed(2)}</td>
                  <td className="py-1 text-right">
                    {fmtBytes(it.netRxBytes)} ↓ / {fmtBytes(it.netTxBytes)} ↑
                  </td>
                  <td className="py-1 text-right pr-2">
                    {fmtBytes(it.blockReadBytes)} / {fmtBytes(it.blockWriteBytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return n + 'B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + 'GB'
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
