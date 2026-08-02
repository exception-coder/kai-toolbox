import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { hasFeatureAccess, requiredRolesFor } from '@/shell/access'
import { useAccessContext } from '@/shell/permission'
import type { FeatureManifest } from '@/shell/types'
import { getDevelopmentAccess } from '@/features/reqpool/api'

/**
 * 路由级门禁：无权访问该模块时渲染占位（请登录 / 需要权限），不渲染真实页面，
 * 防止深链直达绕过菜单隐藏，也避免页面用 localStorage/示例数据兜底渲染敏感内容。
 */
export function RouteGuard({ feature, children }: { feature: FeatureManifest; children: ReactNode }) {
  const { user } = useAuth()
  const access = useAccessContext()
  const location = useLocation()
  const normalAccess = hasFeatureAccess(feature, access)
  const scopedPrdSessionId = useMemo(() => {
    if (feature.id !== 'claude-chat') return null
    return new URLSearchParams(location.search).get('prdSessionId')?.trim() || null
  }, [feature.id, location.search])
  const [scopedState, setScopedState] = useState<'idle' | 'checking' | 'allowed' | 'denied'>('idle')

  useEffect(() => {
    if (normalAccess || !scopedPrdSessionId) {
      setScopedState('idle')
      return
    }
    let alive = true
    setScopedState('checking')
    getDevelopmentAccess(scopedPrdSessionId)
      .then(() => { if (alive) setScopedState('allowed') })
      .catch(() => { if (alive) setScopedState('denied') })
    return () => { alive = false }
  }, [normalAccess, scopedPrdSessionId])

  if (normalAccess || (scopedPrdSessionId && scopedState === 'allowed')) {
    return <>{children}</>
  }
  if (scopedPrdSessionId && scopedState === 'checking') {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">正在验证需求开发权限…</div>
  }
  const required = requiredRolesFor(feature.id)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--color-muted-foreground)]">
      <p className="text-base font-medium">无权访问</p>
      <p className="text-sm">
        {user
          ? `该模块需要 ${required.join(' 或 ')} 权限，请联系管理员开通。`
          : '请先登录后再访问该模块，登录入口在左侧菜单栏底部。'}
      </p>
    </div>
  )
}
