import { lazy, Suspense } from 'react'
import { usePermission } from '@/shell/permission'

const Environment = lazy(() => import('./pages/ForgeEnvironmentPage').then(module => ({ default: module.ForgeEnvironmentPage })))

/** 项目库中的全局环境入口，保留原环境权限。 */
export function ProjectEnvironment() {
  const allowed = usePermission('forge:environment:menu')
  if (!allowed) return <section className="space-y-2 py-4"><h2 className="font-medium">需要环境管理权限</h2><p className="text-sm text-[var(--color-muted-foreground)]">请联系管理员授予 Forge 环境权限，再管理本机共享工具。</p></section>
  return <Suspense fallback={<p role="status">正在读取全局环境…</p>}><Environment embedded /></Suspense>
}
