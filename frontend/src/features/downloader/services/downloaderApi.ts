import { http, subscribeSse, type SseHandlers } from '@/lib/api'
import type {
  CreateTaskRequest,
  ProxyProbeResult,
  TaskDetailView,
  TaskView,
} from '../types'

const BASE = '/downloader'

export const downloaderApi = {
  create(req: CreateTaskRequest) {
    return http<TaskView>(`${BASE}/tasks`, {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  list(params?: { state?: string; limit?: number }) {
    const q = new URLSearchParams()
    if (params?.state) q.set('state', params.state)
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return http<TaskView[]>(`${BASE}/tasks${qs ? '?' + qs : ''}`)
  },

  detail(id: number) {
    return http<TaskDetailView>(`${BASE}/tasks/${id}`)
  },

  pause(id: number) {
    return http<TaskView>(`${BASE}/tasks/${id}/pause`, { method: 'POST' })
  },

  resume(id: number) {
    return http<TaskView>(`${BASE}/tasks/${id}/resume`, { method: 'POST' })
  },

  remove(id: number, keepFile = false) {
    return http<void>(`${BASE}/tasks/${id}?keepFile=${keepFile}`, { method: 'DELETE' })
  },

  detectProxy() {
    return http<ProxyProbeResult>(`${BASE}/proxy/detect`)
  },

  subscribeEvents(id: number, handlers: SseHandlers) {
    // 后端只发 progress / state / segment；显式声明 extraEvents，避免被框架默认事件名截胡
    return subscribeSse(`${BASE}/tasks/${id}/events`, handlers, ['state', 'segment'])
  },
}
