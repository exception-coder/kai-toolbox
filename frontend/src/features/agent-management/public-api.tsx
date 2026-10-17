import { lazy, Suspense } from 'react'
import { usePermission } from '@/shell/permission'

const DatabaseSelection = lazy(() => import('./workflow/ConsultDatabaseSelection').then(module => ({ default: module.ConsultDatabaseSelection })))

/** 公开聚焦的编辑入口，禁止跨模块复用内部 API 或绕过原菜单权限。 */
export function ConsultDatabaseSelection() {
  const allowed = usePermission('menu:agent-management')
  if (!allowed) return <p role="status" className="text-xs">需要 Agent 管理权限，才能修改咨询流程的数据库选择。</p>
  return <Suspense fallback={<p role="status">正在读取数据库选择…</p>}><DatabaseSelection /></Suspense>
}
