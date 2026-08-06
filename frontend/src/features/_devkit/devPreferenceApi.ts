import { http } from '@/lib/api'

export interface DevServicePreference {
  cwd: string
  command: string
}

export interface DevWorkbenchPreference {
  cwd: string
  module: string
  requirement: string
  services: Record<string, DevServicePreference>
}

export function getDevPreference<T = DevWorkbenchPreference>(workbenchId: string) {
  return http<T | undefined>(
    `/claude-chat/dev-preferences/${encodeURIComponent(workbenchId)}`,
  )
}

export function saveDevPreference<T = DevWorkbenchPreference>(workbenchId: string, preference: T) {
  return http<T>(
    `/claude-chat/dev-preferences/${encodeURIComponent(workbenchId)}`,
    { method: 'PUT', body: JSON.stringify(preference) },
  )
}
