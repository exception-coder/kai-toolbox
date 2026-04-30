import { Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatBytes, formatNumber } from '@/lib/utils'
import type { ScanLiveState } from '../hooks/useScanEvents'

interface ScanProgressProps {
  rootPath: string
  state: ScanLiveState
}

export function ScanProgress({ rootPath, state }: ScanProgressProps) {
  const { status, progress, result, errorMsg } = state

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <StatusIcon status={status} />
            <span className="font-medium">{labelOf(status)}</span>
            <span className="truncate text-[var(--color-muted-foreground)]">{rootPath}</span>
          </div>
          {result && (
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {formatNumber(result.totalFiles)} 文件 · {formatNumber(result.totalDirs)} 目录 ·{' '}
              <span className="font-medium text-[var(--color-foreground)]">{formatBytes(result.totalSize)}</span>
            </div>
          )}
        </div>

        {status === 'running' && (
          <>
            <Progress indeterminate />
            <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
              <span className="truncate">{progress?.currentPath ?? '准备中…'}</span>
              <span className="ml-3 shrink-0">
                {progress ? (
                  <>
                    已扫描 {formatNumber(progress.scanned)} 项 · {formatBytes(progress.totalSize)}
                  </>
                ) : '...'}
              </span>
            </div>
          </>
        )}

        {status === 'failed' && errorMsg && (
          <div className="text-xs text-[var(--color-destructive)]">错误：{errorMsg}</div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusIcon({ status }: { status: ScanLiveState['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-[var(--color-destructive)]" />
    case 'cancelled':
      return <Ban className="h-4 w-4 text-[var(--color-muted-foreground)]" />
    default:
      return null
  }
}

function labelOf(s: ScanLiveState['status']) {
  return {
    idle: '空闲',
    running: '扫描中',
    completed: '完成',
    cancelled: '已取消',
    failed: '失败',
  }[s]
}
