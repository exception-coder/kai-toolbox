import { http } from '@/lib/api'

export interface DepartmentNode {
  id: number
  parentId: number
  name: string
  code?: string | null
  sort: number
  status: string
  children: DepartmentNode[]
}

export interface DepartmentSaveRequest {
  parentId?: number | null
  name: string
  code?: string | null
  sort?: number | null
  status?: string | null
}

export function fetchDepartmentTree() {
  return http<DepartmentNode[]>('/forge/departments/tree')
}

export function createDepartment(req: DepartmentSaveRequest) {
  return http<DepartmentNode>('/forge/departments', { method: 'POST', body: JSON.stringify(req) })
}

export function updateDepartment(id: number, req: DepartmentSaveRequest) {
  return http<DepartmentNode>(`/forge/departments/${id}`, { method: 'PUT', body: JSON.stringify(req) })
}

export function deleteDepartment(id: number) {
  return http<void>(`/forge/departments/${id}`, { method: 'DELETE' })
}
