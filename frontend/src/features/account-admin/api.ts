import { http } from '@/lib/api'

export interface AdminUser {
  userId: number
  username: string
  roles: string[]
  enabled: boolean
  createdAt: number
}

/** 常用角色（UI 快选）；仍可自定义输入其它角色。 */
export const COMMON_ROLES = ['ADMIN', 'USER', 'VIDEO_LIBRARY', 'DISK_ADMIN', 'READONLY']

export function listUsers() {
  return http<AdminUser[]>('/auth/users')
}

export function createUser(username: string, password: string, roles: string[]) {
  return http<unknown>('/auth/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, roles }),
  })
}

export function updateRoles(id: number, roles: string[]) {
  return http<AdminUser>(`/auth/users/${id}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roles }),
  })
}

export function setEnabled(id: number, enabled: boolean) {
  return http<AdminUser>(`/auth/users/${id}/enabled`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export function resetPassword(id: number, newPassword: string) {
  return http<{ success: boolean }>(`/auth/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  })
}

export function deleteUser(id: number) {
  return http<void>(`/auth/users/${id}`, { method: 'DELETE' })
}
