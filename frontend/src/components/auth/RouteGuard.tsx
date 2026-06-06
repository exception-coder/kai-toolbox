import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { hasFeatureAccess, requiredRolesFor } from '@/shell/access'
import type { FeatureManifest } from '@/shell/types'

/**
 * 路由级门禁：无权访问该模块时渲染占位（请登录 / 需要权限），不渲染真实页面，
 * 防止深链直达绕过菜单隐藏，也避免页面用 localStorage/示例数据兜底渲染敏感内容。
 */
export function RouteGuard({ feature, children }: { feature: FeatureManifest; children: ReactNode }) {
  const { user } = useAuth()
  if (hasFeatureAccess(feature, user?.roles ?? [])) {
    return <>{children}</>
  }
  const required = requiredRolesFor(feature.id)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--color-muted-foreground)]">
      <p className="text-base font-medium">无权访问</p>
      <p className="text-sm">
        {user
          ? `该模块需要 ${required.join(' 或 ')} 权限，请联系管理员开通。`
          : '请先登录（右上角）后再访问该模块。'}
      </p>
    </div>
  )
}
