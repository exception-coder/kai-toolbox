import { http } from '@/lib/api'
import type { DomainKnowledgeStatus, GraphifyProjectStatus, ProjectRef, ProjectStatusSnapshot } from './types'

export function repoPaths() {
  return http<{ domainKnowledgeRepoPath: string | null; crossTopologyRepoPath: string | null }>('/knowledge-graph/repo-paths')
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

export function graphifyStatus(path: string) {
  return http<GraphifyProjectStatus>(`/knowledge-graph/graphify/status?path=${encodeURIComponent(path)}`)
}

export function domainKnowledgeStatus(path: string) {
  return http<DomainKnowledgeStatus>(`/knowledge-graph/domain-knowledge/status?path=${encodeURIComponent(path)}`)
}

export function crossTopologyStatus(path: string) {
  return http<DomainKnowledgeStatus>(`/knowledge-graph/cross-topology/status?path=${encodeURIComponent(path)}`)
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
