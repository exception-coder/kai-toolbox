import { useNavigate } from 'react-router-dom'
import { Captions, FolderSearch, X, Trash2, ExternalLink, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { TaskView } from '../types'

interface Props {
  task: TaskView
  onCancel: (task: TaskView) => void
  onDelete: (task: TaskView) => void
}

/** 任务状态 → 语义色：失败红 / 取消灰 / 完成绿 / 运行中蓝(脉冲) / 其余等待灰。 */
function statusTone(t: TaskView): { tone: StatusTone; pulse: boolean } {
  if (t.status === 'FAILED') return { tone: 'danger', pulse: false }
  if (t.status === 'CANCELLED') return { tone: 'neutral', pulse: false }
  if (t.status === 'COMPLETED') return { tone: 'success', pulse: false }
  if (t.active) return { tone: 'info', pulse: true }
  return { tone: 'neutral', pulse: false }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return `${m}m${rs}s`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}

function elapsedLabel(t: TaskView): string {
  if (t.finishedAt && t.startedAt) {
    return `用时 ${formatDuration(t.finishedAt - t.startedAt)}`
  }
  if (t.active && t.startedAt) {
    return `已运行 ${formatDuration(Date.now() - t.startedAt)}`
  }
  return ''
}

export function TaskRow({ task, onCancel, onDelete }: Props) {
  const navigate = useNavigate()
  const Icon = task.type === 'SUBTITLE' ? Captions : FolderSearch
  const percent = task.progress >= 0 ? Math.round(task.progress * 100) : 0
  const showIndeterminate = task.active && task.progress < 0

  const { tone, pulse } = statusTone(task)
  const canCancel = task.active && task.type === 'SUBTITLE'
  // scan 的 "取消" 即 "删除":DELETE 接口是合并语义。
  const canDelete = !task.active || task.type === 'SCAN'

  const openLinked = () => {
    if (task.type === 'SUBTITLE' && task.videoPath) {
      navigate('/tools/video-library')
    } else if (task.type === 'SCAN') {
      navigate('/tools/treesize')
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-[var(--color-card)] p-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
          task.type === 'SUBTITLE'
            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300'
            : 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium" title={task.title}>
            {task.title}
          </div>
          <StatusBadge tone={tone} pulse={pulse} className="shrink-0">
            {task.phase}
          </StatusBadge>
          {task.type === 'SUBTITLE' && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              字幕
            </Badge>
          )}
          {task.type === 'SCAN' && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              扫描
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]" title={task.subtitle}>
          {task.subtitle}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress
            value={percent}
            indeterminate={showIndeterminate}
            className="flex-1"
          />
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--color-muted-foreground)]">
            {showIndeterminate ? '…' : `${percent}%`}
          </span>
        </div>
        {(elapsedLabel(task) || task.errorMsg) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>{elapsedLabel(task)}</span>
            {task.errorMsg && (
              <span className="flex items-center gap-1 truncate text-[var(--color-destructive)]" title={task.errorMsg}>
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.errorMsg}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canCancel && (
          <Button size="sm" variant="outline" onClick={() => onCancel(task)}>
            <X className="h-3.5 w-3.5" />
            取消
          </Button>
        )}
        {!task.active && (task.type === 'SUBTITLE' && task.videoPath || task.type === 'SCAN') && (
          <Button size="sm" variant="ghost" onClick={openLinked} title="打开">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(task)} title="删除">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
