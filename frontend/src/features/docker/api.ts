import { http } from '@/lib/api'
import type {
  ComposeActionRequest,
  ComposeActionResponse,
  ComposeFileView,
  ContainerAction,
  ContainerStatsResponse,
  ContainerView,
  ComposeAction,
  DockerAppPayload,
  DockerAppView,
  FileContentView,
  FileWriteResponse,
  LogTailResponse,
  ScannedAppView,
} from './types'

// 应用 CRUD

export function listApps(hostId: string) {
  return http<DockerAppView[]>(`/docker/hosts/${hostId}/apps`)
}

export function createApp(hostId: string, payload: DockerAppPayload) {
  return http<DockerAppView>(`/docker/hosts/${hostId}/apps`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateApp(hostId: string, appId: string, payload: DockerAppPayload) {
  return http<DockerAppView>(`/docker/hosts/${hostId}/apps/${appId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteApp(hostId: string, appId: string) {
  return http<void>(`/docker/hosts/${hostId}/apps/${appId}`, { method: 'DELETE' })
}

export function scanApps(hostId: string, baseDir: string, maxDepth = 3) {
  return http<{ items: ScannedAppView[] }>(`/docker/hosts/${hostId}/scan`, {
    method: 'POST',
    body: JSON.stringify({ baseDir, maxDepth }),
  })
}

// 容器

export function listContainers(hostId: string, appId?: string, includeStopped = true, nocache = false) {
  const q = new URLSearchParams()
  if (appId) q.set('appId', appId)
  q.set('includeStopped', String(includeStopped))
  if (nocache) q.set('nocache', 'true')
  return http<ContainerView[]>(`/docker/hosts/${hostId}/containers?${q}`)
}

export function containerAction(hostId: string, cid: string, action: ContainerAction) {
  return http<void>(`/docker/hosts/${hostId}/containers/${cid}/${action}`, { method: 'POST' })
}

export function getStats(hostId: string, nocache = false) {
  const q = nocache ? '?nocache=true' : ''
  return http<ContainerStatsResponse>(`/docker/hosts/${hostId}/containers/stats${q}`)
}

export function composeAction(hostId: string, appId: string, action: ComposeAction, req?: ComposeActionRequest) {
  return http<ComposeActionResponse>(`/docker/hosts/${hostId}/apps/${appId}/compose/${action}`, {
    method: 'POST',
    body: JSON.stringify(req ?? {}),
  })
}

// 日志

export function tailLogs(hostId: string, cid: string, tail = 200, since?: string, timestamps = false) {
  const q = new URLSearchParams()
  q.set('tail', String(tail))
  if (since) q.set('since', since)
  q.set('timestamps', String(timestamps))
  return http<LogTailResponse>(`/docker/hosts/${hostId}/containers/${cid}/logs?${q}`)
}

export function logStreamUrl(hostId: string, cid: string, tail = 200, since?: string, timestamps = false) {
  const q = new URLSearchParams()
  q.set('tail', String(tail))
  if (since) q.set('since', since)
  q.set('timestamps', String(timestamps))
  return `/docker/hosts/${hostId}/containers/${cid}/logs/stream?${q}`
}

export function closeStream(streamId: string) {
  return http<void>(`/docker/streams/${streamId}`, { method: 'DELETE' })
}

// 配置文件

export function listFiles(hostId: string, appId: string) {
  return http<ComposeFileView[]>(`/docker/hosts/${hostId}/apps/${appId}/files`)
}

export function readFile(hostId: string, appId: string, path: string) {
  return http<FileContentView>(
    `/docker/hosts/${hostId}/apps/${appId}/files/content?path=${encodeURIComponent(path)}`,
  )
}

export function writeFile(hostId: string, appId: string, path: string, content: string) {
  return http<FileWriteResponse>(`/docker/hosts/${hostId}/apps/${appId}/files/content`, {
    method: 'PUT',
    body: JSON.stringify({ path, content }),
  })
}
