import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import {
  cancelSubtitleTask,
  deleteScanTask,
  deleteSubtitleTask,
  listTasks,
  subscribeTaskCenterSse,
} from '../api'
import type { TaskFilter, TaskView } from '../types'
import { TaskRow } from '../components/TaskRow'

const FILTER_LABEL: Record<TaskFilter, string> = {
  active: '进行中',
  all: '最近全部',
  failed: '失败',
}

function applyFilter(tasks: TaskView[], filter: TaskFilter): TaskView[] {
  if (filter === 'active') return tasks.filter(t => t.active)
  if (filter === 'failed') return tasks.filter(t => t.status === 'FAILED')
  return tasks
}

export function TaskCenterPage() {
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<TaskFilter>('active')
  // 我们用 query 拉首屏一次,后续都靠 SSE 增量;所以这里 cache 用作可变 store。
  const queryKey = ['task-center', 'tasks']
  const { data: tasks = [], isLoading, error, refetch, isFetching } = useQuery<TaskView[], ApiError>({
    queryKey,
    queryFn: () => listTasks({ limit: 100 }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  // SSE: 每条 task 事件都 upsert 进 cache (按 id 替换),终态任务保留以便筛 "失败"。
  useEffect(() => {
    const close = subscribeTaskCenterSse((task) => {
      qc.setQueryData<TaskView[]>(queryKey, (prev) => {
        const list = prev ? [...prev] : []
        const idx = list.findIndex(t => t.id === task.id)
        if (idx >= 0) {
          list[idx] = task
        } else {
          list.unshift(task)
        }
        return list
      })
    })
    return close
    // queryKey 是字面量数组,内容稳定不会触发 re-subscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => ({
    active: tasks.filter(t => t.active).length,
    all: tasks.length,
    failed: tasks.filter(t => t.status === 'FAILED').length,
  }), [tasks])

  const visible = useMemo(() => applyFilter(tasks, filter), [tasks, filter])

  async function handleCancel(task: TaskView) {
    const ok = await confirm({
      title: '取消该任务?',
      description: `「${task.title}」正在 ${task.phase},取消后已生成的中间产物将被清理。`,
      confirmText: '取消任务',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      if (task.type === 'SUBTITLE') await cancelSubtitleTask(task.id)
      else await deleteScanTask(task.id)
    } catch (e) {
      console.error('cancel task failed', e)
    }
  }

  async function handleDelete(task: TaskView) {
    const ok = await confirm({
      title: '删除该任务记录?',
      description:
        task.type === 'SUBTITLE'
          ? `这会删除字幕作业「${task.title}」及生成的 VTT 文件。`
          : `这会删除扫描记录「${task.title}」及其文件清单缓存。`,
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      if (task.type === 'SUBTITLE') await deleteSubtitleTask(task.id)
      else await deleteScanTask(task.id)
      // SSE 没有 "removed" 事件,本地手动把这一行从 cache 摘掉。
      qc.setQueryData<TaskView[]>(queryKey, (prev) => (prev ?? []).filter(t => t.id !== task.id))
    } catch (e) {
      console.error('delete task failed', e)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-[var(--color-primary)]" />
              <CardTitle>任务中心</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              刷新
            </Button>
          </div>
          <CardDescription>
            字幕作业(音频抽取 / 转写 / 翻译)与目录扫描的统一视图。状态变化通过 SSE 实时推送。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {(['active', 'all', 'failed'] as TaskFilter[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {FILTER_LABEL[f]}
                <Badge
                  variant={filter === f ? 'secondary' : 'outline'}
                  className="ml-1 px-1.5 py-0 text-[10px]"
                >
                  {counts[f]}
                </Badge>
              </Button>
            ))}
          </div>

          {isLoading && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              加载中…
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-lg border border-dashed border-[var(--color-destructive)]/40 p-4 text-sm text-[var(--color-destructive)]">
              加载失败:{error.message}
            </div>
          )}

          {!isLoading && !error && visible.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              {filter === 'active' ? '当前没有后台任务' : '没有符合条件的任务记录'}
            </div>
          )}

          <div className="space-y-2">
            {visible.map((task) => (
              <TaskRow key={task.id} task={task} onCancel={handleCancel} onDelete={handleDelete} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
