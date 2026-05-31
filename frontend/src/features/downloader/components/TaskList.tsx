import { useQuery } from '@tanstack/react-query'
import { downloaderApi } from '../services/downloaderApi'
import { TaskCard } from './TaskCard'

export function TaskList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['downloader', 'tasks'],
    queryFn: () => downloaderApi.list({ limit: 100 }),
    // 列表本身用轮询兜底；卡片内部走 SSE，速率/进度走实时
    refetchInterval: 5000,
  })

  if (isLoading) {
    return <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
  }

  if (error) {
    return (
      <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
        加载任务列表失败：{(error as Error).message}
      </div>
    )
  }

  const tasks = data ?? []
  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        暂无任务。粘贴一个 URL，开始第一个下载。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tasks.map(t => (
        <TaskCard key={t.taskId} task={t} />
      ))}
    </div>
  )
}
