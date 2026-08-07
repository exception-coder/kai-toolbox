import { http } from '@/lib/api'

export type MiniProgramEnvironmentMode = 'FORMAL' | 'TEST' | 'CUSTOM'

export interface MiniProgramEnvironmentConfig {
  projectPath: string
  mode: MiniProgramEnvironmentMode
  currentAppId: string
  apiBaseUrl: string
  wechatSiEnabled: boolean
  backupAvailable: boolean
}

export function getMiniProgramEnvironment(cwd: string) {
  return http<MiniProgramEnvironmentConfig>(`/claude-chat/erp-mini-program/environment?cwd=${encodeURIComponent(cwd)}`)
}

export function applyMiniProgramEnvironment(
  cwd: string,
  mode: Exclude<MiniProgramEnvironmentMode, 'CUSTOM'>,
  apiBaseUrl: string,
) {
  return http<MiniProgramEnvironmentConfig>('/claude-chat/erp-mini-program/environment', {
    method: 'PUT',
    body: JSON.stringify({ cwd, mode, apiBaseUrl }),
  })
}

export function restoreMiniProgramEnvironment(cwd: string) {
  return http<MiniProgramEnvironmentConfig>('/claude-chat/erp-mini-program/environment/restore', {
    method: 'POST',
    body: JSON.stringify({ cwd }),
  })
}
