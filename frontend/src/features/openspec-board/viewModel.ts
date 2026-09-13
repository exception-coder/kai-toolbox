import type { OpenSpecTask, OpenSpecTaskState } from './types'

export const TASK_COLUMNS: Array<{ state: OpenSpecTaskState; label: string }> = [
  { state: 'TODO', label: '待执行' },
  { state: 'IN_PROGRESS', label: '进行中' },
  { state: 'IN_REVIEW', label: '待验证' },
  { state: 'BLOCKED', label: '阻塞' },
  { state: 'DONE', label: '已完成' },
]

export type TaskFilter = OpenSpecTaskState | 'ALL' | 'REMAINING'

export function filterTasks(tasks: OpenSpecTask[], query: string, state: TaskFilter) {
  const normalized = query.trim().toLocaleLowerCase()
  return tasks.filter(task => {
    const matchesState = state === 'ALL' || (state === 'REMAINING' ? task.state !== 'DONE' : task.state === state)
    const haystack = `${task.outlineId} ${task.description} ${task.section}`.toLocaleLowerCase()
    return matchesState && (!normalized || haystack.includes(normalized))
  })
}
