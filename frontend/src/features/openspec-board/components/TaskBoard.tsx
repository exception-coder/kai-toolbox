import { AlertCircle, Check, Circle, Clock3, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { TASK_COLUMNS, filterTasks } from '../viewModel'
import type { OpenSpecTask, OpenSpecTaskState } from '../types'

interface TaskBoardProps {
  tasks: OpenSpecTask[]
  query: string
  state: OpenSpecTaskState | 'ALL'
  selectedTaskId: string | null
  onQueryChange: (query: string) => void
  onStateChange: (state: OpenSpecTaskState | 'ALL') => void
  onTaskSelect: (taskId: string) => void
}

export function TaskBoard(props: TaskBoardProps) {
  const visibleTasks = filterTasks(props.tasks, props.query, props.state)

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <Input
            value={props.query}
            onChange={event => props.onQueryChange(event.target.value)}
            placeholder="搜索任务编号或内容"
            className="h-9 pl-9 text-xs shadow-none"
          />
        </div>
        <select
          aria-label="任务状态"
          value={props.state}
          onChange={event => props.onStateChange(event.target.value as OpenSpecTaskState | 'ALL')}
          className="h-9 rounded-md border bg-[var(--color-background)] px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] md:hidden"
        >
          <option value="ALL">全部状态</option>
          {TASK_COLUMNS.map(column => <option key={column.state} value={column.state}>{column.label}</option>)}
        </select>
      </div>

      <div className="mt-4 hidden min-w-[760px] grid-cols-5 gap-3 md:grid">
        {TASK_COLUMNS.map(column => {
          const tasks = visibleTasks.filter(task => task.state === column.state)
          return (
            <div key={column.state} className="min-w-0 border-t border-[var(--color-border)] pt-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold">{column.label}</h3>
                <span className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">{tasks.length}</span>
              </div>
              <div className="space-y-2">
                {tasks.map(task => <TaskCard key={task.id} task={task} selected={task.id === props.selectedTaskId} onSelect={props.onTaskSelect} />)}
                {tasks.length === 0 && <p className="px-1 py-4 text-[10px] text-[var(--color-muted-foreground)]">暂无任务</p>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 space-y-2 md:hidden">
        {visibleTasks.map(task => <TaskCard key={task.id} task={task} selected={task.id === props.selectedTaskId} onSelect={props.onTaskSelect} />)}
        {visibleTasks.length === 0 && <p className="border-t py-8 text-sm text-[var(--color-muted-foreground)]">没有符合当前条件的任务，请清除筛选后重试。</p>}
      </div>
    </section>
  )
}

function TaskCard({ task, selected, onSelect }: { task: OpenSpecTask; selected: boolean; onSelect: (id: string) => void }) {
  const StateIcon = task.state === 'DONE' ? Check : task.state === 'BLOCKED' ? AlertCircle : task.state === 'IN_PROGRESS' || task.state === 'IN_REVIEW' ? Clock3 : Circle
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={`w-full rounded-lg border bg-[var(--color-card)] p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${selected ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'}`}
    >
      <div className="flex items-start gap-2">
        <StateIcon className={`mt-0.5 size-3.5 shrink-0 ${task.state === 'BLOCKED' ? 'text-[var(--color-danger)]' : task.state === 'DONE' ? 'text-[var(--color-success)]' : 'text-[var(--color-muted-foreground)]'}`} />
        <span className="text-[10px] font-semibold tabular-nums text-[var(--color-muted-foreground)]">{task.outlineId}</span>
      </div>
      <p className="mt-2 line-clamp-4 text-xs leading-5">{task.description}</p>
      {task.runtime && <p className="mt-3 border-t pt-2 text-[10px] text-[var(--color-muted-foreground)]">{task.runtime.engine} · {task.runtime.phase}</p>}
    </button>
  )
}
