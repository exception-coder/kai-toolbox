import { http, subscribeSse, type SseHandlers } from '@/lib/api'
import type { TaskView } from './types'

export function listTasks(opts?: { activeOnly?: boolean; limit?: number }) {
  const params = new URLSearchParams()
  if (opts?.activeOnly) params.set('activeOnly', 'true')
  if (opts?.limit != null) params.set('limit', String(opts.limit))
  const qs = params.toString()
  return http<TaskView[]>(`/treesize/tasks${qs ? '?' + qs : ''}`)
}

/**
 * 订阅任务中心 SSE 全局频道。事件名固定 'task',data 为 TaskView。
 * 返回 close 函数;组件 unmount 时调用一次即可。
 */
export function subscribeTaskCenterSse(onTask: (task: TaskView) => void, onError?: SseHandlers['onError']): () => void {
  return subscribeSse(
    '/treesize/tasks/events',
    {
      onEvent: (name, data) => {
        if (name === 'task' && data && typeof data === 'object') {
          onTask(data as TaskView)
        }
      },
      onError,
    },
    ['task'],
  )
}

// ---------- actions on tasks --------------------------------------------

export function cancelSubtitleTask(id: string) {
  return http<void>(`/treesize/subtitles/jobs/${id}/cancel`, { method: 'POST' })
}

export function deleteSubtitleTask(id: string) {
  return http<void>(`/treesize/subtitles/jobs/${id}`, { method: 'DELETE' })
}

/** 注意:DELETE /scans/{id} 是 cancel + 删除合并语义,运行中任务点这个就直接停掉并清记录。 */
export function deleteScanTask(id: string) {
  return http<void>(`/treesize/scans/${id}`, { method: 'DELETE' })
}
