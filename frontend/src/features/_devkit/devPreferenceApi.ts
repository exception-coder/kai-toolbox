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

export function getDevPreference(workbenchId: string) {
  return http<DevWorkbenchPreference | undefined>(
    `/claude-chat/dev-preferences/${encodeURIComponent(workbenchId)}`,
  )
}

export function saveDevPreference(workbenchId: string, preference: DevWorkbenchPreference) {
  return http<DevWorkbenchPreference>(
    `/claude-chat/dev-preferences/${encodeURIComponent(workbenchId)}`,
    { method: 'PUT', body: JSON.stringify(preference) },
  )
}
