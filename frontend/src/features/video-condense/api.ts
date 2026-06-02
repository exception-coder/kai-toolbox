import { http, subscribeSse, type SseHandlers } from '@/lib/api'
import type { JobView, SegmentView } from './types'

/** 提交分析作业，返回 jobId。 */
export function analyze(path: string) {
  return http<{ jobId: string }>('/video-condense/analyze', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

export function getJob(id: string) {
  return http<JobView>(`/video-condense/jobs/${id}`)
}

/** 用（可能微调过的）曲线触发渲染。 */
export function render(jobId: string, segments: SegmentView[], musicPath?: string) {
  return http<JobView>('/video-condense/render', {
    method: 'POST',
    body: JSON.stringify({ jobId, segments, musicPath: musicPath?.trim() || null }),
  })
}

export function cancelJob(id: string) {
  return http<JobView>(`/video-condense/jobs/${id}/cancel`, { method: 'POST' })
}

export function recentJobs() {
  return http<JobView[]>('/video-condense/jobs')
}

/** 订阅作业进度 SSE（事件名 progress）。返回关闭函数。 */
export function subscribeJob(id: string, handlers: SseHandlers) {
  return subscribeSse(`/video-condense/jobs/${id}/events`, handlers)
}

/** 产物直链（支持 Range，可直接喂 <video>）。 */
export function artifactUrl(id: string) {
  return `/api/video-condense/jobs/${id}/artifact`
}
