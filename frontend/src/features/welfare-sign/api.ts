import { http } from '@/lib/api'
import type { EmployeePayload, EmployeeView, LoginResponse, SignRecordView, WelfareConfig } from './types'

export function getConfig() {
  return http<WelfareConfig>('/welfare-sign/config')
}

export function saveConfig(payload: Partial<WelfareConfig>) {
  return http<WelfareConfig>('/welfare-sign/config', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function listEmployees() {
  return http<EmployeeView[]>('/welfare-sign/employees')
}

export function createEmployee(payload: EmployeePayload) {
  return http<EmployeeView>('/welfare-sign/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateEmployee(id: number, payload: EmployeePayload) {
  return http<EmployeeView>(`/welfare-sign/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteEmployee(id: number) {
  return http<void>(`/welfare-sign/employees/${id}`, { method: 'DELETE' })
}

export function login(payload: { loginId: string; password?: string; smsCode?: string }) {
  return http<LoginResponse>('/welfare-sign/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function sign(payload: { employeeId: number; signatureData: string; extra: Record<string, unknown> }) {
  return http<{ ok: boolean; redirectUrl: string | null }>('/welfare-sign/sign', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listRecords() {
  return http<SignRecordView[]>('/welfare-sign/records')
}
