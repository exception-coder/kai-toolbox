import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { downloaderApi } from '../services/downloaderApi'
import { useTaskSse } from '../hooks/useTaskSse'
import type { TaskView } from '../types'
import { formatBytes, formatDuration, formatRate } from './formatters'

interface TaskCardProps {
  task: TaskView
}

export function TaskCard({ task }: TaskCardProps) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const live = useTaskSse(task.taskId, task.state !== 'COMPLETED' && task.state !== 'FAILED')

  // 实时态优先；SSE 没事件时回落到列表 API 给出的快照
  const state = live?.state ?? task.state
  const downloaded = live?.downloaded ?? task.downloadedSize
  const total = live?.total ?? task.totalSize
  const rate = live?.rateBps ?? task.currentRateBps
  const eta = live?.etaSeconds ?? task.etaSeconds
  const routeType = live?.routeType ?? task.routeType
  const routeProxy = live?.routeProxy ?? task.routeProxy
  const lastError = live?.lastError ?? null

  const percent = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0

  const pauseMutation = useMutation({
    mutationFn: () => downloaderApi.pause(task.taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloader', 'tasks'] }),
  })
  const resumeMutation = useMutation({
    mutationFn: () => downloaderApi.resume(task.taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloader', 'tasks'] }),
  })
  const removeMutation = useMutation({
    mutationFn: () => downloaderApi.remove(task.taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloader', 'tasks'] }),
  })

  async function handleRemove() {
    const ok = await confirm({
      title: '删除任务',
      description: state === 'COMPLETED'
        ? '仅清除任务记录与临时文件（最终文件保留）。'
        : '将清除任务记录和未完成的临时文件。',
      confirmText: '删除',
      variant: 'destructive',
    })
    if (ok) removeMutation.mutate()
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-sm font-medium" title={task.filename}>{task.filename}</div>
            <div className="truncate text-xs text-[var(--color-muted-foreground)]" title={task.url}>
              {task.url}
            </div>
          </div>
          <StateBadge state={state} />
        </div>

        <div className="space-y-1.5">
          <Progress value={percent} indeterminate={state === 'PROBING'} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
            <div>
              {formatBytes(downloaded)}
              {total > 0 && <> / {formatBytes(total)}</>}
              {total > 0 && <span className="ml-2 opacity-70">{percent.toFixed(1)}%</span>}
            </div>
            <div className="flex items-center gap-3">
              {state === 'DOWNLOADING' && (
                <>
                  <span>{formatRate(rate)}</span>
                  <span>剩余 {formatDuration(eta)}</span>
                </>
              )}
              {routeType && (
                <Badge variant={routeType === 'PROXY' ? 'secondary' : 'outline'}>
                  {routeType === 'PROXY' ? `代理 ${routeProxy ?? ''}` : '直连'}
                </Badge>
              )}
              <Badge variant="outline">
                {task.httpEngine === 'OKHTTP' ? 'OkHttp' : 'JDK'}
              </Badge>
            </div>
          </div>
        </div>

        {lastError && state === 'FAILED' && (
          <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-2 text-xs text-[var(--color-destructive)]">
            {lastError}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-[11px] text-[var(--color-muted-foreground)]" title={task.savePath}>
            保存到 <code className="font-mono">{task.savePath}</code>
          </div>
          <div className="flex gap-2">
            {(state === 'DOWNLOADING' || state === 'PROBING' || state === 'QUEUED') && (
              <Button
                size="sm"
                variant="outline"
                disabled={pauseMutation.isPending}
                onClick={() => pauseMutation.mutate()}
              >
                <Pause /> 暂停
              </Button>
            )}
            {(state === 'PAUSED' || state === 'FAILED') && (
              <Button
                size="sm"
                disabled={resumeMutation.isPending}
                onClick={() => resumeMutation.mutate()}
              >
                <Play /> 继续
              </Button>
            )}
            <Button size="sm" variant="destructive" disabled={removeMutation.isPending} onClick={handleRemove}>
              <Trash2 /> 删除
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StateBadge({ state }: { state: TaskView['state'] }) {
  switch (state) {
    case 'COMPLETED':
      return <Badge variant="success">已完成</Badge>
    case 'FAILED':
      return <Badge variant="destructive">失败</Badge>
    case 'PAUSED':
      return <Badge variant="outline">已暂停</Badge>
    case 'PROBING':
      return <Badge variant="secondary">链路探测中</Badge>
    case 'DOWNLOADING':
      return <Badge>下载中</Badge>
    default:
      return <Badge variant="outline">{state}</Badge>
  }
}
