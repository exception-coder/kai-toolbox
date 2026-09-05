import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, RefreshCw, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOpenSpecBoards, getOpenSpecChange } from '../api'
import { ProjectChangeRail } from '../components/ProjectChangeRail'
import { TaskBoard } from '../components/TaskBoard'
import { TaskInspector } from '../components/TaskInspector'
import type { OpenSpecTaskState } from '../types'

export function OpenSpecBoardPage() {
  const [projectId, setProjectId] = useState('')
  const [changeId, setChangeId] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<OpenSpecTaskState | 'ALL'>('ALL')
  const [boardRefresh, setBoardRefresh] = useState(0)
  const [detailRefresh, setDetailRefresh] = useState(0)
  const boardsQuery = useQuery({
    queryKey: ['openspec-boards', boardRefresh],
    queryFn: () => getOpenSpecBoards(boardRefresh > 0),
    staleTime: 15_000,
  })
  const projects = useMemo(() => boardsQuery.data?.projects ?? [], [boardsQuery.data])
  const activeProject = projects.find(project => project.id === projectId) ?? projects[0] ?? null
  const activeChange = activeProject?.changes.find(change => change.id === changeId) ?? activeProject?.changes[0] ?? null

  useEffect(() => {
    if (activeProject && activeProject.id !== projectId) setProjectId(activeProject.id)
    if (activeChange && activeChange.id !== changeId) setChangeId(activeChange.id)
    if (!activeChange && changeId) setChangeId('')
  }, [activeChange, activeProject, changeId, projectId])

  const detailQuery = useQuery({
    queryKey: ['openspec-change', activeProject?.id, activeChange?.id, detailRefresh],
    queryFn: () => getOpenSpecChange(activeProject!.id, activeChange!.id, detailRefresh > 0),
    enabled: Boolean(activeProject?.id && activeChange?.id),
    staleTime: 15_000,
  })
  const detail = detailQuery.data
  const selectedTask = detail?.tasks.find(task => task.id === taskId) ?? null

  if (boardsQuery.isLoading) return <PageState title="正在读取 OpenSpec 项目" />
  if (boardsQuery.isError) return <PageError message={errorMessage(boardsQuery.error)} onRetry={() => boardsQuery.refetch()} />

  return (
    <div className="min-h-full bg-[var(--color-background)] p-4 text-[var(--color-foreground)] md:p-6">
      <div className="mx-auto max-w-[1800px]">
        <header className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]"><Workflow className="size-3.5" />OpenSpec / Delivery Work</div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">研发任务看板</h1>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">项目 → 需求 → 任务，完成事实以 OpenSpec 为准</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[var(--color-muted-foreground)]">
            {boardsQuery.data?.snapshotAt && <span>快照 {formatTime(boardsQuery.data.snapshotAt)}</span>}
            <Button variant="ghost" size="sm" onClick={() => setBoardRefresh(value => value + 1)} disabled={boardsQuery.isFetching}>
              <RefreshCw className={boardsQuery.isFetching ? 'animate-spin' : ''} />刷新项目
            </Button>
          </div>
        </header>

        {projects.length === 0 ? (
          <EmptyProjects onRetry={() => boardsQuery.refetch()} />
        ) : (
          <main className="grid gap-4 pt-4 xl:grid-cols-[240px_minmax(600px,1fr)_280px]">
            <ProjectChangeRail
              projects={projects}
              projectId={activeProject?.id ?? ''}
              changeId={activeChange?.id ?? ''}
              onProjectSelect={id => { setProjectId(id); setChangeId(''); setTaskId(null); setQuery('') }}
              onChangeSelect={id => { setChangeId(id); setTaskId(null); setQuery(''); setState('ALL') }}
            />
            {!activeChange ? (
              <NoChanges projectName={activeProject?.name ?? ''} onRetry={() => boardsQuery.refetch()} />
            ) : detailQuery.isLoading ? (
              <PageState title="正在读取需求任务" compact />
            ) : detailQuery.isError || !detail ? (
              <PageError message={errorMessage(detailQuery.error)} onRetry={() => detailQuery.refetch()} compact />
            ) : (
              <>
                <div className="min-w-0 overflow-x-auto">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div><h2 className="text-base font-semibold">{detail.title}</h2><p className="mt-1 font-mono text-[10px] text-[var(--color-muted-foreground)]">{detail.changeId} · {detail.completedTasks}/{detail.totalTasks} 已完成 · {detail.freshness === 'STALE' ? '快照已过期' : `快照 ${formatTime(detail.snapshotAt)}`}</p></div>
                    <Button variant="ghost" size="sm" onClick={() => setDetailRefresh(value => value + 1)} disabled={detailQuery.isFetching}><RefreshCw className={detailQuery.isFetching ? 'animate-spin' : ''} />刷新需求</Button>
                  </div>
                  <TaskBoard tasks={detail.tasks} query={query} state={state} selectedTaskId={taskId} onQueryChange={setQuery} onStateChange={setState} onTaskSelect={setTaskId} />
                </div>
                <TaskInspector detail={detail} task={selectedTask} />
              </>
            )}
          </main>
        )}
      </div>
    </div>
  )
}

function PageState({ title, compact = false }: { title: string; compact?: boolean }) {
  return <div className={`flex items-center gap-3 text-sm text-[var(--color-muted-foreground)] ${compact ? 'min-h-48' : 'min-h-[70vh] justify-center'}`}><Loader2 className="size-4 animate-spin" />{title}</div>
}

function PageError({ message, onRetry, compact = false }: { message: string; onRetry: () => void; compact?: boolean }) {
  return <div className={compact ? 'min-h-48 border-l-2 border-[var(--color-danger)] pl-4 pt-2' : 'mx-auto mt-24 max-w-lg border-l-2 border-[var(--color-danger)] pl-4'}><h2 className="flex items-center gap-2 text-sm font-semibold"><AlertCircle className="size-4" />任务数据加载失败</h2><p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">{message}</p><Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>重新加载</Button></div>
}

function EmptyProjects({ onRetry }: { onRetry: () => void }) {
  return <div className="py-16"><h2 className="text-base font-semibold">还没有可展示的工作区项目</h2><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">请先在 Forge 工作区配置项目，然后刷新看板。</p><Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>刷新项目</Button></div>
}

function NoChanges({ projectName, onRetry }: { projectName: string; onRetry: () => void }) {
  return <div className="py-12"><h2 className="text-base font-semibold">{projectName || '当前项目'}没有活动需求</h2><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">创建 OpenSpec change 后，这里会自动显示需求和任务。</p><Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>重新检查</Button></div>
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : '请稍后重试' }
function formatTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
