import { AlertTriangle, Boxes, Database, Files, HardDrive, ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBytes, formatDate, formatNumber } from '@/lib/utils'
import { getCleanupCandidates } from '../api'
import type { CleanupCandidate, CleanupCategory, CleanupSafety } from '../types'

interface CleanupRecommendationsProps {
  scanId: string
}

const categoryLabel: Record<CleanupCategory, string> = {
  CACHE: '缓存候选',
  LARGE_OLD: '大文件候选',
  DUPLICATE: '重复文件候选',
  DOCKER: 'Docker 候选',
  DANGEROUS: '危险数据提示',
}

const safetyLabel: Record<CleanupSafety, string> = {
  SAFE: 'SAFE',
  REVIEW: 'REVIEW',
  DANGEROUS: 'DANGEROUS',
}

export function CleanupRecommendations({ scanId }: CleanupRecommendationsProps) {
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['treesize-cleanup-candidates', scanId],
    queryFn: () => getCleanupCandidates(scanId),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-[var(--color-muted-foreground)]">
          正在分析清理建议…
        </CardContent>
      </Card>
    )
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-[var(--color-muted-foreground)]">
          暂未发现明显的清理候选项
        </CardContent>
      </Card>
    )
  }

  const groups = groupByCategory(candidates)
  const totalSafe = candidates
    .filter(c => c.safety === 'SAFE')
    .reduce((sum, c) => sum + c.size, 0)
  const totalReview = candidates
    .filter(c => c.safety === 'REVIEW')
    .reduce((sum, c) => sum + c.size, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" />
          清理建议
          <Badge variant="success">SAFE {formatBytes(totalSafe)}</Badge>
          <Badge variant="secondary">REVIEW {formatBytes(totalReview)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(groups).map(([category, items]) => (
          <section key={category} className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between border-b bg-[var(--color-muted)]/25 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CategoryIcon category={category as CleanupCategory} />
                {categoryLabel[category as CleanupCategory]}
              </div>
              <div className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
                {formatNumber(items.length)} 项 · {formatBytes(items.reduce((sum, c) => sum + c.size, 0))}
              </div>
            </div>
            <ul className="divide-y">
              {items.slice(0, 20).map(item => (
                <li key={`${item.category}:${item.path}`} className="space-y-2 px-3 py-3 text-sm">
                  <div className="flex items-start gap-3">
                    <SafetyBadge safety={item.safety} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" title={item.path}>
                        {item.name}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-[var(--color-muted-foreground)]" title={item.path}>
                        {item.path}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                      {formatBytes(item.size)}
                    </div>
                  </div>
                  <div className="grid gap-1 pl-20 text-xs text-[var(--color-muted-foreground)] sm:grid-cols-[1fr_auto]">
                    <div>{item.reason}</div>
                    <div className="tabular-nums">
                      {item.modifiedAt ? `修改于 ${formatDate(item.modifiedAt)}` : '修改时间未知'}
                    </div>
                    <div className="sm:col-span-2">{item.deleteHint}</div>
                    {item.dir && (
                      <div className="sm:col-span-2">
                        {formatNumber(item.fileCount)} 文件 / {formatNumber(item.dirCount)} 目录
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {items.length > 20 && (
              <div className="border-t px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                已显示前 20 项，其余 {formatNumber(items.length - 20)} 项可后续加入分页或筛选。
              </div>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  )
}

function groupByCategory(candidates: CleanupCandidate[]) {
  return candidates.reduce<Partial<Record<CleanupCategory, CleanupCandidate[]>>>((acc, item) => {
    acc[item.category] = [...(acc[item.category] ?? []), item]
    return acc
  }, {})
}

function SafetyBadge({ safety }: { safety: CleanupSafety }) {
  const variant = safety === 'SAFE' ? 'success' : safety === 'DANGEROUS' ? 'destructive' : 'secondary'
  return <Badge variant={variant}>{safetyLabel[safety]}</Badge>
}

function CategoryIcon({ category }: { category: CleanupCategory }) {
  switch (category) {
    case 'CACHE':
      return <Boxes className="h-4 w-4 text-[var(--color-primary)]" />
    case 'LARGE_OLD':
      return <HardDrive className="h-4 w-4 text-[var(--color-primary)]" />
    case 'DUPLICATE':
      return <Files className="h-4 w-4 text-[var(--color-primary)]" />
    case 'DOCKER':
      return <Boxes className="h-4 w-4 text-[var(--color-primary)]" />
    case 'DANGEROUS':
      return <Database className="h-4 w-4 text-[var(--color-destructive)]" />
    default:
      return <AlertTriangle className="h-4 w-4" />
  }
}
