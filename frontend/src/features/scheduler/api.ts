import { http, subscribeSse } from '@/lib/api'
import type { ExecutionView, SchedulerTask } from './types'

export async function listSchedulerTasks(): Promise<SchedulerTask[]> {
  return (await http<{ items: SchedulerTask[] }>('/scheduler/tasks')).items
}

export async function listExecutions(taskId: string): Promise<ExecutionView[]> {
  return (await http<{ items: ExecutionView[] }>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}/executions?limit=50`,
  )).items
}

export function runTask(taskId: string) {
  return http<{ accepted: boolean }>(`/scheduler/tasks/${encodeURIComponent(taskId)}/run`, { method: 'POST' })
}

export function pauseTask(taskId: string) {
  return http<void>(`/scheduler/tasks/${encodeURIComponent(taskId)}/pause`, { method: 'POST' })
}

export function resumeTask(taskId: string) {
  return http<void>(`/scheduler/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST' })
}

export function updateTaskCron(taskId: string, cron: string, zone: string) {
  return http<void>(`/scheduler/tasks/${encodeURIComponent(taskId)}/cron`, {
    method: 'PUT',
    body: JSON.stringify({ cron, zone }),
  })
}

export function subscribeScheduler(onChange: () => void) {
  return subscribeSse('/scheduler/events', { onEvent: onChange }, ['task', 'execution'])
}
