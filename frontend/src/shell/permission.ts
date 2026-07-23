import { http } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { AccessContext } from './access'

/** 从登录态派生访问上下文（角色 + 权限码 + 超管），供菜单显隐 / 路由守卫 / 按钮显隐复用。 */
export function useAccessContext(): AccessContext {
  const { user, permissionCodes, superAdmin } = useAuth()
  return {
    roles: user?.roles ?? [],
    permissionCodes: permissionCodes ?? [],
    superAdmin: !!superAdmin,
  }
}

/** 当前用户是否持有某权限码（超管恒 true；code 为空视为无需权限，恒 true）。 */
export function usePermission(code?: string): boolean {
  const ctx = useAccessContext()
  if (ctx.superAdmin) return true
  if (!code) return true
  return ctx.permissionCodes.includes(code)
}

export interface MyPermissions {
  superAdmin: boolean
  permissionCodes: string[]
}

/** 刷新页面后从后端回填权限快照（FR-FE-04，非实时回源，读的是 JWT 快照）。 */
export function fetchMyPermissions() {
  return http<MyPermissions>('/forge/me/permissions')
}
