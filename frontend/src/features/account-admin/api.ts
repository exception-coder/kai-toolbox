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

// ===== Forge 权限体系：用户↔角色/部门授权（扩展账号管理页）=====

export interface UserGrant {
  userId: number
  roleIds: number[]
  departmentId: number | null
}

export interface ForgeRoleOption {
  id: number
  name: string
  code: string
  status: string
}

export interface ForgeDeptNode {
  id: number
  name: string
  children: ForgeDeptNode[]
}

export function fetchUserGrant(userId: number) {
  return http<UserGrant>(`/forge/users/${userId}/roles`)
}

/** 批量拉取所有账号的 forge 角色/部门归属，供账号列表展示。 */
export function fetchAllUserGrants() {
  return http<UserGrant[]>('/forge/users/grants')
}

export function assignUserRoles(userId: number, roleIds: number[]) {
  return http<UserGrant>(`/forge/users/${userId}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roleIds }),
  })
}

export function setUserDepartment(userId: number, departmentId: number | null) {
  return http<UserGrant>(`/forge/users/${userId}/department`, {
    method: 'PUT',
    body: JSON.stringify({ departmentId }),
  })
}

export function fetchForgeRoles() {
  return http<ForgeRoleOption[]>('/forge/roles')
}

export function fetchForgeDeptTree() {
  return http<ForgeDeptNode[]>('/forge/departments/tree')
}
