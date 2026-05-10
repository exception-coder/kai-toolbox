import { http } from '@/lib/api'
import type { ProjectsListResponse } from './types'

export function listProjects() {
  return http<ProjectsListResponse>('/projects')
}

export function openInExplorer(path: string) {
  return http<void>('/projects/open', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}
