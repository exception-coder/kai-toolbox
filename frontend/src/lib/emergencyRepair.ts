export const EMERGENCY_REPAIR_REQUEST_EVENT = 'kai-toolbox:emergency-repair-request'
export const EMERGENCY_REPAIR_STATUS_EVENT = 'kai-toolbox:emergency-repair-status'

export interface EmergencyRepairRequest {
  id: string
  featureId: string
  route: string
  errorName: string
  errorMessage: string
  requestedAt: number
}

export type EmergencyRepairStatus =
  | { id: string; state: 'starting'; message: string }
  | { id: string; state: 'started'; message: string; sessionId?: string }
  | { id: string; state: 'failed'; message: string }

/**
 * 由 shell 错误边界发出，Vibe Coding 的常驻运行时接管。
 * 使用浏览器事件而不是导入具体 feature，避免故障模块的 import 链再次拖垮修复入口。
 */
export function requestEmergencyRepair(input: Omit<EmergencyRepairRequest, 'id' | 'requestedAt'>): string {
  const id = crypto.randomUUID()
  const request: EmergencyRepairRequest = { ...input, id, requestedAt: Date.now() }
  window.dispatchEvent(new CustomEvent<EmergencyRepairRequest>(EMERGENCY_REPAIR_REQUEST_EVENT, { detail: request }))
  return id
}

export function publishEmergencyRepairStatus(status: EmergencyRepairStatus): void {
  window.dispatchEvent(new CustomEvent<EmergencyRepairStatus>(EMERGENCY_REPAIR_STATUS_EVENT, { detail: status }))
}
