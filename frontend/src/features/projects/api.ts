import { http } from '@/lib/api'
import type { CommitDiff, CommitsResponse, ProjectsListResponse } from './types'

export function listProjects() {
  return http<ProjectsListResponse>('/projects')
}

export function openInExplorer(path: string) {
  return http<void>('/projects/open', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

/** 列项目最近提交。 */
export function listCommits(path: string, limit?: number) {
  const qs = new URLSearchParams({ path })
  if (limit) qs.set('limit', String(limit))
  return http<CommitsResponse>(`/projects/git/commits?${qs.toString()}`)
}

/** 取某提交的 diff。 */
export function getCommitDiff(path: string, hash: string) {
  const qs = new URLSearchParams({ path, hash })
  return http<CommitDiff>(`/projects/git/commit?${qs.toString()}`)
}
