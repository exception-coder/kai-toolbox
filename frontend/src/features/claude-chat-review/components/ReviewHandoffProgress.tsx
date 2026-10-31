import { useEffect, useState } from 'react'
import { listPublicReviewTodos, reviewTodoStatusLabel, type PublicReviewTodoProgress } from '@/features/claude-chat/public-api'

/** 公开页只展示本空间交接状态，不读取原会话、执行草稿或内部诊断。 */
export function ReviewHandoffProgress({ token, requirements, refreshKey }: {
  token: string; requirements: Array<{ id: string; title: string }>; refreshKey: string | number
}) {
  const [tasks, setTasks] = useState<PublicReviewTodoProgress[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    let busy = false
    setTasks([]); setError(null)
    const load = async () => {
      if (busy) return
      busy = true
      try {
        const result = await listPublicReviewTodos(token)
        if (alive) { setTasks(result); setError(null) }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : '交接进度暂不可用') }
      finally { busy = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), 10_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [token, refreshKey, retry])
  return <details className="border-t px-3 py-2 text-xs">
    <summary className="min-h-8 cursor-pointer font-medium">交接进度{tasks.length > 0 ? ` · ${tasks.length} 项` : ''}</summary>
    <p className="py-1 text-slate-500">提交只登记待办，由原会话确认后开始执行。</p>
    {error && <p role="alert" className="py-1">{error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>刷新进度</button></p>}
    {!error && tasks.length === 0 && <p className="py-1 text-slate-500">尚无已登记的评审待办。</p>}
    <ul className="divide-y">
      {tasks.map(task => <li key={task.id} className="flex items-start justify-between gap-3 py-2">
        <span className="min-w-0 break-words">{requirements.find(item => item.id === task.requirementId)?.title ?? '已提交评审意见'} <span className="text-slate-500">第 {task.sourceRevision} 版</span></span>
        <span className="shrink-0">{reviewTodoStatusLabel[task.status]}</span>
      </li>)}
    </ul>
  </details>
}
