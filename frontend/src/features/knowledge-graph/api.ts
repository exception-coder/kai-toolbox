import { http } from '@/lib/api'
import type { DomainKnowledgeStatus, GraphifyProjectStatus, ProjectRef, ProjectStatusSnapshot } from './types'

export function repoPaths() {
  return http<{ domainKnowledgeRepoPath: string | null; crossTopologyRepoPath: string | null }>('/knowledge-graph/repo-paths')
}

/** 引擎与两仓就绪：路径配否、目录存否、引擎是否已构建（dist/server.js）。 */
export interface EngineStatus {
  domainConfigured: boolean
  domainRepoExists: boolean
  engineBuilt: boolean
  crossConfigured: boolean
  crossRepoExists: boolean
}

export function engineStatus() {
  return http<EngineStatus>('/knowledge-graph/engine-status')
}

/** Graphify 3D 力导图数据（后端按度数截断的子图）。 */
export interface GraphifyGraph {
  total: number
  shown: number
  truncated: boolean
  nodes: { id: string; label: string; group: string | null; community: number | null; communityName: string | null }[]
  links: { source: string; target: string; relation: string | null }[]
}

export function graphifyGraph(path: string, limit = 0) {
  const p = new URLSearchParams({ path })
  if (limit) p.set('limit', String(limit))
  return http<GraphifyGraph>(`/knowledge-graph/graphify/graph?${p.toString()}`)
}

export function recentProjects() {
  return http<ProjectRef[]>('/knowledge-graph/projects/recent')
}

export function resolveProject(path: string) {
  return http<ProjectRef>('/knowledge-graph/projects/resolve', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

export function graphifyStatus(path: string, signal?: AbortSignal) {
  return statusRequest<GraphifyProjectStatus>(`/knowledge-graph/graphify/status?path=${encodeURIComponent(path)}`, signal)
}

export function domainKnowledgeStatus(path: string, signal?: AbortSignal) {
  return statusRequest<DomainKnowledgeStatus>(`/knowledge-graph/domain-knowledge/status?path=${encodeURIComponent(path)}`, signal)
}

export function crossTopologyStatus(path: string, signal?: AbortSignal) {
  return statusRequest<DomainKnowledgeStatus>(`/knowledge-graph/cross-topology/status?path=${encodeURIComponent(path)}`, signal)
}

/** 状态检测允许取消，并在等待过久时恢复操作入口。 */
async function statusRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let rejectPending: (error: Error) => void = () => {}
  const interrupted = new Promise<never>((_resolve, reject) => { rejectPending = reject })
  const abort = () => {
    rejectPending(new DOMException('检测已取消', 'AbortError'))
    controller.abort()
  }
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => {
    rejectPending(new Error('状态检测超过 15 秒，请稍后重试；可以继续操作其他区域。'))
    controller.abort()
  }, 15_000)
  try {
    return await Promise.race([interrupted, http<T>(path, { signal: controller.signal })])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

/** 读取已缓存的跨项目状态快照（不触发检测，供项目工作台筛选栏加载即用）。 */
export function statusCache() {
  return http<{ statuses: Record<string, ProjectStatusSnapshot> }>('/knowledge-graph/status-cache')
    .then((res) => res.statuses)
}

/** 批量检测指定项目路径，写回缓存并返回本次范围的最新结果（"检测全部"按钮触发）。 */
export function refreshStatusCache(paths: string[]) {
  return http<{ statuses: Record<string, ProjectStatusSnapshot> }>('/knowledge-graph/status-cache/refresh', {
    method: 'POST',
    body: JSON.stringify({ paths }),
  }).then((res) => res.statuses)
}
