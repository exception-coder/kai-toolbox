import { http } from '@/lib/api'
import type { InitRun, ProjectDetail, ProjectMetadata, RegistryProject, SystemTask } from './types'

const base = '/project-registry'
export const listRegistry = () => http<RegistryProject[]>(base)
export const getProject = (id: string) => http<ProjectDetail>(`${base}/${encodeURIComponent(id)}`)
export const registerProject = (metadata: ProjectMetadata) => http<RegistryProject>(base, {
  method: 'POST', body: JSON.stringify(metadata),
})
export const updateProject = (id: string, metadata: ProjectMetadata) => http<RegistryProject>(`${base}/${encodeURIComponent(id)}`, {
  method: 'PUT', body: JSON.stringify(metadata),
})
export const initializeProject = (id: string, mode: 'FULL' | 'SYNC') => http<InitRun>(`${base}/${encodeURIComponent(id)}/init`, {
  method: 'POST', body: JSON.stringify({ mode }),
})
export const createSystemTask = (id: string, input: { title: string; description: string; domainId: string; context: string }) =>
  http<SystemTask>(`${base}/${encodeURIComponent(id)}/tasks`, { method: 'POST', body: JSON.stringify(input) })
export const getTaskContext = (id: string, taskId: string) =>
  http<{ prompt: string }>(`${base}/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/context`)
