import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { magnetApi } from '../services/magnetApi'
import { MagnetTaskCard } from './MagnetTaskCard'
import type { MagnetTaskState } from '../types'

// "进行中" 的判定：仍在 aria2 调度池里的任务，能被取消
const IN_PROGRESS_STATES: MagnetTaskState[] = ['ACTIVE', 'QUEUED', 'PAUSED']

export function MagnetTaskList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['magnet', 'tasks'],
    queryFn: () => magnetApi.list(200),
    // aria2 任务进度走轮询，1.5s 一次足以呈现近实时速率
    refetchInterval: 1500,
  })
  const [showHistory, setShowHistory] = useState(true)

  const { active, history } = useMemo(() => {
    const tasks = data ?? []
    return {
      active: tasks.filter(t => IN_PROGRESS_STATES.includes(t.state)),
      history: tasks.filter(t => !IN_PROGRESS_STATES.includes(t.state)),
    }
  }, [data])

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
        暂无任务。粘贴磁力链接或上传 .torrent 开始第一个下载。
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          进行中 <span className="ml-1 opacity-60">({active.length})</span>
        </h3>
        {active.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-[var(--color-muted-foreground)]">
            没有正在进行的任务
          </div>
        ) : (
          <div className="space-y-3">
            {active.map(t => <MagnetTaskCard key={t.gid} task={t} />)}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            onClick={() => setShowHistory(v => !v)}
            aria-expanded={showHistory}
          >
            {showHistory ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            历史 <span className="ml-1 opacity-60">({history.length})</span>
          </button>
          {showHistory && (
            <div className="space-y-3">
              {history.map(t => <MagnetTaskCard key={t.gid} task={t} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
