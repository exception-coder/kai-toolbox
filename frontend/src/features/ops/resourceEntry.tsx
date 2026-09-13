import { lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { usePermission } from '@/shell/permission'

const Resources = lazy(() => import('./resources/SystemResourcesPage').then(module => ({ default: module.SystemResourcesPage })))

export function SystemResources() {
  const allowed = usePermission('menu:ops')
  if (!allowed) return <section className="p-6"><h1 className="font-semibold">需要系统资源管理权限</h1><p className="mt-2 text-sm text-muted-foreground">请联系管理员授予原资源管理权限，再管理系统资源与测试账号。</p></section>
  return <Suspense fallback={<p role="status">正在读取系统资源…</p>}><Resources /></Suspense>
}

export function LegacyOpsRedirect() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  if (!query.has('view')) query.set('view', 'connections')
  return <Navigate replace to={`/tools/reqpool/resources?${query}${location.hash}`} />
}
