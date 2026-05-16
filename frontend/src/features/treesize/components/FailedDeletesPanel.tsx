import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  clearFailedDeletes,
  listFailedDeletes,
  removeFailedDelete,
  retryFailedDeletes,
  type FailedDeleteView,
  type RetryFailedDeletesResultView,
} from '../api'

const QUERY_KEY = ['treesize-failed-deletes'] as const

interface Props {
  active: boolean
}

/**
 * Read-write panel for the backend's failed-delete registry — files whose delete attempts
 * landed in {@code outcome=QUEUED}. Polls every 5s while the sheet is open so newly queued
 * paths (from background junk-clean or another tab) surface without manual refresh.
 *
 * <p>Retry / clear / remove all invalidate {@code treesize-children} across every scan,
 * because a successful retry removes the file from disk and the corresponding tree row.
 */
export function FailedDeletesPanel({ active }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRetry, setLastRetry] = useState<RetryFailedDeletesResultView | null>(null)

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listFailedDeletes,
    refetchInterval: active && autoRefresh ? 5000 : false,
    enabled: active,
  })

  const entries = query.data ?? []
  const errorMsg = query.error
    ? (query.error instanceof ApiError ? query.error.message : String(query.error))
    : null

  const invalidateChildren = () => {
    qc.invalidateQueries({ queryKey: ['treesize-children'] })
  }

  const retryMutation = useMutation({
    mutationFn: retryFailedDeletes,
    onSuccess: async res => {
      setLastRetry(res)
      qc.setQueryData(QUERY_KEY, res.remaining)
      invalidateChildren()
      await confirm({
        title: retryDialogTitle(res),
        description: <RetryDialogBody result={res} />,
        confirmText: '知道了',
        cancelText: '关闭',
      })
    },
    onError: async err => {
      const msg = err instanceof ApiError ? err.message : String(err)
      await confirm({
        title: '重试失败',
        description: msg,
        confirmText: '知道了',
        cancelText: '关闭',
      })
    },
  })

  const clearMutation = useMutation({
    mutationFn: clearFailedDeletes,
    onSuccess: () => {
      setLastRetry(null)
      qc.setQueryData(QUERY_KEY, [])
    },
  })

  const removeMutation = useMutation({
    mutationFn: (path: string) => removeFailedDelete(path),
    onSuccess: (_data, path) => {
      qc.setQueryData<FailedDeleteView[]>(QUERY_KEY, prev => (prev ?? []).filter(e => e.path !== path))
    },
  })

  const handleRetry = () => {
    if (entries.length === 0) return
    retryMutation.mutate()
  }

  const handleClear = async () => {
    if (entries.length === 0) return
    const ok = await confirm({
      title: '清空失败清单？',
      description: `将移除 ${entries.length} 条记录。文件本身不会被删除，可重新扫描后再试。`,
      confirmText: '清空',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (ok) clearMutation.mutate()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <div>
            <div className="text-base font-semibold">删除失败清单</div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              占用 / IO 失败的文件 · 关闭占用程序后可批量重试
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(v => !v)}
            className="h-7 px-2 text-xs"
          >
            {autoRefresh ? '自动刷新' : '已暂停'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="h-7 w-7 p-0"
            aria-label="手动刷新"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {query.isLoading && entries.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : errorMsg && entries.length === 0 ? (
          <ErrorBanner message={errorMsg} />
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {lastRetry && <RetrySummary result={lastRetry} />}
            <ul className="space-y-2">
              {entries.map(e => (
                <EntryRow
                  key={e.path}
                  entry={e}
                  onRemove={() => removeMutation.mutate(e.path)}
                  removeBusy={removeMutation.isPending && removeMutation.variables === e.path}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <div className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
          共 {entries.length} 条
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={entries.length === 0 || clearMutation.isPending}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </Button>
          <Button
            size="sm"
            onClick={handleRetry}
            disabled={entries.length === 0 || retryMutation.isPending}
            className="gap-1.5"
          >
            {retryMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            全部重试
          </Button>
        </div>
      </footer>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-md border bg-[var(--color-card)] px-4 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
      暂无失败记录。删除文件时若被其他程序占用，会自动出现在这里供批量重试。
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-3 py-2 text-xs text-[var(--color-destructive)]">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <div className="font-medium">读取失败</div>
        <div className="mt-0.5 break-words text-[var(--color-destructive)]/80">{message}</div>
      </div>
    </div>
  )
}

function RetrySummary({ result }: { result: RetryFailedDeletesResultView }) {
  const tone =
    result.deleted > 0 && result.queued === 0
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
      : result.queued > 0
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
        : 'border bg-[var(--color-muted)]/30 text-[var(--color-foreground)]'
  return (
    <div className={cn('rounded-md border px-3 py-2 text-xs', tone)}>
      <div className="font-medium">上次重试</div>
      <div className="mt-0.5 tabular-nums">
        共 {result.attempted}，成功 {result.deleted}，仍占用 {result.queued}
      </div>
    </div>
  )
}

function EntryRow({
  entry,
  onRemove,
  removeBusy,
}: {
  entry: FailedDeleteView
  onRemove: () => void
  removeBusy: boolean
}) {
  const fileName = basename(entry.path)
  return (
    <li className="rounded-md border bg-[var(--color-card)] px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={entry.path}>
            {fileName}
          </div>
          <div
            className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-muted-foreground)]"
            title={entry.path}
          >
            {entry.path}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          重试 {entry.attempts}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={removeBusy}
          className="h-6 w-6 shrink-0 p-0"
          aria-label="从清单移除"
          title="从清单移除（不删除文件）"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-muted-foreground)]">
        <span className="font-mono">{formatTime(entry.lastAttemptAt)}</span>
        <span className="truncate" title={entry.reason}>
          {entry.reason}
        </span>
      </div>
    </li>
  )
}

function retryDialogTitle(res: RetryFailedDeletesResultView): string {
  if (res.attempted === 0) return '清单为空'
  if (res.deleted === res.attempted) return `已删除 ${res.deleted} 个文件`
  if (res.deleted === 0) return `${res.queued} 个文件仍被占用`
  return `成功 ${res.deleted} 个，仍占用 ${res.queued} 个`
}

function RetryDialogBody({ result }: { result: RetryFailedDeletesResultView }) {
  const allDone = result.deleted > 0 && result.queued === 0
  const allFailed = result.deleted === 0 && result.queued > 0
  return (
    <div className="space-y-2 text-sm">
      <div className="tabular-nums">
        共尝试 {result.attempted}，删除 {result.deleted}，仍占用 {result.queued}
      </div>
      {allDone && (
        <div className="text-emerald-600 dark:text-emerald-400">
          全部清单条目已成功删除并从清单移除。
        </div>
      )}
      {allFailed && (
        <div className="text-amber-600 dark:text-amber-400">
          全部文件仍被其他程序占用，请确认 VLC / 资源管理器预览 / 杀软扫描等已退出后再试。
        </div>
      )}
      {!allDone && !allFailed && result.queued > 0 && (
        <div className="text-amber-600 dark:text-amber-400">
          还有 {result.queued} 个文件未删除，留在清单中供下次重试。
        </div>
      )}
    </div>
  )
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return idx >= 0 ? path.slice(idx + 1) : path
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}
