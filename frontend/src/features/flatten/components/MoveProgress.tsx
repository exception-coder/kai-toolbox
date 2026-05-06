import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatNumber } from '@/lib/utils'
import type { MoveLiveState } from '../hooks/useMoveEvents'

interface MoveProgressProps {
  targetPath: string
  state: MoveLiveState
}

export function MoveProgress({ targetPath, state }: MoveProgressProps) {
  const { status, progress, result, errorMsg } = state
  const pct = progress && progress.total > 0
    ? Math.round((progress.moved / progress.total) * 100)
    : 0

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
            {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            {status === 'failed' && <XCircle className="h-4 w-4 text-[var(--color-destructive)]" />}
            <span className="font-medium">
              {status === 'running' && '迁移中'}
              {status === 'completed' && '迁移完成'}
              {status === 'failed' && '迁移失败'}
              {status === 'idle' && '准备中'}
            </span>
            <span className="truncate text-[var(--color-muted-foreground)]">→ {targetPath}</span>
          </div>
          {progress && (
            <div className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
              {formatNumber(progress.moved)} / {formatNumber(progress.total)}
            </div>
          )}
        </div>

        {status === 'running' && progress && (
          <>
            <Progress value={pct} />
            <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
              <span className="truncate font-mono">{progress.currentFile}</span>
              <span className="ml-3 shrink-0 tabular-nums">{pct}%</span>
            </div>
          </>
        )}

        {status === 'completed' && result && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300">
            已成功移动 {formatNumber(result.movedFiles)} 个文件。
          </div>
        )}

        {status === 'failed' && errorMsg && (
          <div className="text-xs text-[var(--color-destructive)]">错误：{errorMsg}</div>
        )}
      </CardContent>
    </Card>
  )
}
