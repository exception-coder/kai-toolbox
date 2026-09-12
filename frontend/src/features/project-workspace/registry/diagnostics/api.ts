import { http } from '@/lib/api'
import type { ProjectRouteBinding, SystemRouteCandidate, SystemRouteInspection } from './types'

export function listSystemRouteCandidates(): Promise<SystemRouteCandidate[]> {
  return http('/claude-chat/system-route-inspections/systems')
}

export function listProjectRouteBindings(): Promise<ProjectRouteBinding[]> {
  return http('/claude-chat/project-route-bindings')
}

export async function listWorkspaceProjectPaths(): Promise<string[]> {
  const response = await http<{ roots: Array<{ exists: boolean; dirs: Array<{ path: string }> }> }>('/claude-chat/workspaces')
  return response.roots.filter(root => root.exists).flatMap(root => root.dirs.map(directory => directory.path))
}

export function inspectSystemRoute(input: { project: string; module?: string; url?: string }): Promise<SystemRouteInspection> {
  const query = new URLSearchParams({ project: input.project })
  if (input.module?.trim()) query.set('module', input.module.trim())
  if (input.url?.trim()) query.set('url', input.url.trim())
  return http(`/claude-chat/system-route-inspections?${query.toString()}`)
}

export function saveProjectRouteBinding(projectKey: string, projectPath: string, aliases: string[]): Promise<ProjectRouteBinding> {
  return http(`/claude-chat/project-route-bindings/${encodeURIComponent(projectKey)}`, {
    method: 'PUT',
    body: JSON.stringify({ projectPath, aliases }),
  })
}

export function deleteProjectRouteBinding(projectKey: string): Promise<void> {
  return http(`/claude-chat/project-route-bindings/${encodeURIComponent(projectKey)}`, { method: 'DELETE' })
}
