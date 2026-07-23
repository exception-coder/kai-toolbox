import { http } from '@/lib/api'

export interface RoleView {
  id: number
  name: string
  code: string
  description?: string | null
  builtin: boolean
  dataScopeType: string
  status: string
  createdAt: number
}

export interface RoleDetail {
  role: RoleView
  permissionIds: number[]
}

export interface RoleSaveRequest {
  name: string
  code: string
  description?: string | null
  dataScopeType?: string | null
  status?: string | null
}

export interface PermissionView {
  id: number
  code: string
  name: string
  type: string
  module: string
  parentCode?: string | null
  sort: number
  status: string
}

export function listRoles() {
  return http<RoleView[]>('/forge/roles')
}

export function getRole(id: number) {
  return http<RoleDetail>(`/forge/roles/${id}`)
}

export function createRole(req: RoleSaveRequest) {
  return http<RoleView>('/forge/roles', { method: 'POST', body: JSON.stringify(req) })
}

export function updateRole(id: number, req: RoleSaveRequest) {
  return http<RoleView>(`/forge/roles/${id}`, { method: 'PUT', body: JSON.stringify(req) })
}

export function deleteRole(id: number) {
  return http<void>(`/forge/roles/${id}`, { method: 'DELETE' })
}

export function bindPermissions(id: number, permissionIds: number[]) {
  return http<RoleDetail>(`/forge/roles/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissionIds }),
  })
}

export function listPermissions() {
  return http<PermissionView[]>('/forge/permissions')
}
