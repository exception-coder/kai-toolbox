import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Database, FolderSearch, HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { analyzeDiskUsage, type DiskUsageItem } from '../api'

export function DiskUsageOverview() {
  const [expanded, setExpanded] = useState(true)
  const analysis = useQuery({
    queryKey: ['devclean-disk-usage'],
    queryFn: analyzeDiskUsage,
    enabled: false,
    staleTime: 0,
  })
  const data = analysis.data
  const explainedRatio =
    data && data.usedBytes > 0 ? Math.min(100, (data.measuredBytes / data.usedBytes) * 100) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <HardDrive className="h-4 w-4" />
              C 盘占用盘点
              {data && <Badge variant="secondary">已用 {formatBytes(data.usedBytes)}</Badge>}
            </CardTitle>
            {expanded && (
              <CardDescription className="mt-1.5">
                解释“可清理 32GB”和磁盘已用约 150GB 之间的差额，并识别用户目录里的软件数据大户。
                这里只读分析，不会把识别结果自动加入清理。
              </CardDescription>
            )}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(value => !value)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? '收起' : '展开'}
          </Button>
        </div>
      </CardHeader>
      {expanded && <CardContent className="space-y-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={analysis.isFetching}
          onClick={() => analysis.refetch()}
        >
          {analysis.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : data ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <FolderSearch className="h-3.5 w-3.5" />
          )}
          {analysis.isFetching ? '正在扫描大目录…' : data ? '重新盘点' : '开始盘点 C 盘'}
        </Button>

        {analysis.isError && (
          <p className="text-sm text-[var(--color-destructive)]">
            盘点失败：{analysis.error instanceof ApiError ? analysis.error.message : String(analysis.error)}
          </p>
        )}

        {data && (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Metric label="磁盘容量" value={formatBytes(data.totalBytes)} />
              <Metric label="已使用" value={formatBytes(data.usedBytes)} />
              <Metric label="剩余可用" value={formatBytes(data.freeBytes)} />
              <Metric
                label="根目录已解释"
                value={`${formatBytes(data.measuredBytes)} · ${explainedRatio.toFixed(0)}%`}
              />
            </div>
            <UsageList
              title="C 盘一级占用"
              description="这些分桶互不重叠，可以相加后与“已使用”对照。受权限保护的系统数据可能少计。"
              items={data.rootItems}
            />
            <UsageList
              title="软件数据大户"
              description="来自当前用户 AppData 的 Local / Roaming 下钻，已包含在 Users 中，请勿与上方再次相加。"
              items={data.softwareItems}
              software
            />
          </>
        )}
      </CardContent>}
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-[var(--color-muted)]/30 p-3">
      <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function UsageList({
  title,
  description,
  items,
  software = false,
}: {
  title: string
  description: string
  items: DiskUsageItem[]
  software?: boolean
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {software && <Database className="h-3.5 w-3.5" />}
          {title}
        </h3>
        <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>
      </div>
      <div className="overflow-hidden rounded-xl border">
        {items.length === 0 ? (
          <p className="p-3 text-sm text-[var(--color-muted-foreground)]">未发现超过阈值的目录。</p>
        ) : (
          <ul className="divide-y">
            {items.map(item => (
              <li key={`${item.scope}:${item.path}`} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="truncate text-xs text-[var(--color-muted-foreground)]" title={item.path}>
                    {software ? `${item.scope} · ` : ''}
                    {item.path}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatBytes(item.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
