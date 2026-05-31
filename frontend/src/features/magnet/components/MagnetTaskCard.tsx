import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, Trash2, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { magnetApi } from '../services/magnetApi'
import type { MagnetTaskView } from '../types'

interface Props { task: MagnetTaskView }

export function MagnetTaskCard({ task }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()

  const pause = useMutation({
    mutationFn: () => magnetApi.pause(task.gid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['magnet', 'tasks'] }),
  })
  const resume = useMutation({
    mutationFn: () => magnetApi.resume(task.gid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['magnet', 'tasks'] }),
  })
  const remove = useMutation({
    mutationFn: () => magnetApi.remove(task.gid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['magnet', 'tasks'] }),
  })

  const isInProgress = task.state === 'ACTIVE' || task.state === 'QUEUED' || task.state === 'PAUSED'

  async function handleRemove() {
    const ok = await confirm({
      title: isInProgress ? '取消任务' : '删除任务',
      description: isInProgress
        ? '将停止 aria2 对该任务的解析/下载；已下载的临时文件由 aria2 自行处理。'
        : '仅清除任务记录（已下载的文件保留在硬盘）。',
      confirmText: isInProgress ? '取消下载' : '删除',
      variant: 'destructive',
    })
    if (ok) remove.mutate()
  }

  const percent = task.totalLength > 0
    ? Math.min(100, (task.completedLength / task.totalLength) * 100)
    : 0

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-sm font-medium" title={task.displayName}>
              {task.displayName || `任务 ${task.gid}`}
            </div>
            {task.files.length > 1 && (
              <div className="text-[11px] text-[var(--color-muted-foreground)]">
                包含 {task.files.length} 个文件
              </div>
            )}
            {task.infoHash && (
              <div className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]" title={task.infoHash}>
                infoHash: {task.infoHash}
              </div>
            )}
          </div>
          <StateBadge task={task} />
        </div>

        <div className="space-y-1.5">
          <Progress value={percent} indeterminate={task.state === 'ACTIVE' && task.totalLength === 0} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
            <div>
              {formatBytes(task.completedLength)}
              {task.totalLength > 0 && <> / {formatBytes(task.totalLength)}</>}
              {task.totalLength > 0 && (
                <span className="ml-2 opacity-70">{percent.toFixed(1)}%</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {task.state === 'ACTIVE' && (
                <>
                  <span>↓ {formatRate(task.downloadSpeedBps)}</span>
                  {task.uploadSpeedBps > 0 && <span>↑ {formatRate(task.uploadSpeedBps)}</span>}
                </>
              )}
              {(task.numSeeders > 0 || task.numConnections > 0) && (
                <Badge variant="outline">
                  <Users className="mr-1 size-3" />
                  {task.numSeeders} 种 / {task.numConnections} 连
                </Badge>
              )}
            </div>
          </div>
        </div>

        {task.state === 'FAILED' && task.errorMessage && (
          <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-2 text-xs text-[var(--color-destructive)]">
            #{task.errorCode}: {task.errorMessage}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-[11px] text-[var(--color-muted-foreground)]" title={task.savePath ?? ''}>
            保存到 <code className="font-mono">{task.savePath ?? '(默认)'}</code>
          </div>
          <div className="flex gap-2">
            {task.state === 'ACTIVE' && (
              <Button size="sm" variant="outline" disabled={pause.isPending}
                onClick={() => pause.mutate()}>
                <Pause /> 暂停
              </Button>
            )}
            {(task.state === 'PAUSED' || task.state === 'QUEUED') && (
              <Button size="sm" disabled={resume.isPending} onClick={() => resume.mutate()}>
                <Play /> 继续
              </Button>
            )}
            <Button size="sm" variant="destructive"
              disabled={remove.isPending} onClick={handleRemove}>
              {isInProgress ? <X /> : <Trash2 />} {isInProgress ? '取消' : '删除'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StateBadge({ task }: { task: MagnetTaskView }) {
  switch (task.state) {
    case 'COMPLETED': return <Badge variant="success">已完成</Badge>
    case 'FAILED': return <Badge variant="destructive">失败</Badge>
    case 'PAUSED': return <Badge variant="outline">已暂停</Badge>
    case 'QUEUED': return <Badge variant="secondary">排队中</Badge>
    case 'ACTIVE':
      // totalLength=0 时 aria2 仍在拉 metadata（磁力链场景），还没拿到文件信息
      return task.totalLength === 0
        ? <Badge variant="secondary">解析种子中</Badge>
        : <Badge>下载中</Badge>
    case 'REMOVED': return <Badge variant="outline">已删除</Badge>
    default: return <Badge variant="outline">{task.state}</Badge>
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`
}

function formatRate(bps: number): string {
  if (bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}
