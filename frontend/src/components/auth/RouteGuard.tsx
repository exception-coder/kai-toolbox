import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { hasFeatureAccess, requiredRolesFor } from '@/shell/access'
import { useAccessContext } from '@/shell/permission'
import type { FeatureManifest } from '@/shell/types'
import { getDevelopmentAccess } from '@/features/reqpool/api'

/**
 * 路由级门禁：未登录返回工作台，无权限时提供恢复入口，不渲染真实页面，
 * 防止深链直达绕过菜单隐藏，也避免页面用 localStorage/示例数据兜底渲染敏感内容。
 */
export function RouteGuard({ feature, children }: { feature: FeatureManifest; children: ReactNode }) {
  const { user } = useAuth()
  const access = useAccessContext()
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const control = location.pathname === feature.entry ? feature.controlPermissions : undefined
  const selectedControl = control ? query.get(control.parameter) : null
  const selectedPermission = control && selectedControl ? control.modes[selectedControl] : undefined
  const normalAccess = hasFeatureAccess({ ...feature, controlPermissions: undefined,
    requiredPermission: selectedPermission ?? feature.requiredPermission }, access)
  const scopedPrdSessionId = useMemo(() => {
    if (feature.id !== 'claude-chat' || selectedPermission) return null
    return new URLSearchParams(location.search).get('prdSessionId')?.trim() || null
  }, [feature.id, location.search, selectedPermission])
  const [scopedState, setScopedState] = useState<'idle' | 'checking' | 'allowed' | 'denied'>('idle')

  useEffect(() => {
    if (!user || normalAccess || !scopedPrdSessionId) {
      setScopedState('idle')
      return
    }
    let alive = true
    setScopedState('checking')
    getDevelopmentAccess(scopedPrdSessionId)
      .then(() => { if (alive) setScopedState('allowed') })
      .catch(() => { if (alive) setScopedState('denied') })
    return () => { alive = false }
  }, [user, normalAccess, scopedPrdSessionId])

  // 工具路由均由注册表赋予菜单权限；公开展示页不经过本门禁。
  // replace 避免手机返回键再次进入无登录态的深链。
  if (!user) return <Navigate replace to="/" />
  if (normalAccess || (scopedPrdSessionId && scopedState === 'allowed')) {
    return <>{children}</>
  }
  if (scopedPrdSessionId && scopedState === 'checking') {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">正在验证需求开发权限…</div>
  }
  if (!selectedControl && !scopedPrdSessionId && control && location.pathname === feature.entry) {
    const permitted = Object.entries(control.modes).find(([, code]) => hasFeatureAccess({ ...feature,
      controlPermissions: undefined, requiredPermission: code }, access))
    if (permitted) {
      query.set(control.parameter, permitted[0])
      return <Navigate replace to={{ pathname: location.pathname, search: `?${query}`, hash: location.hash }} />
    }
  }
  const required = requiredRolesFor(feature.id)
  const defaultAllowed = hasFeatureAccess({ ...feature, controlPermissions: undefined }, access)
  const recoveryMode = control && Object.entries(control.modes).find(([, code]) => hasFeatureAccess({ ...feature,
    controlPermissions: undefined, requiredPermission: code }, access))
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--color-muted-foreground)]">
      <p className="text-base font-medium">无权访问</p>
      <p className="text-sm">
        {required.length > 0
          ? `该模块需要 ${required.join(' 或 ')} 权限，请联系管理员开通。`
          : '当前账号没有该模块的访问权限，请联系管理员开通。'}
      </p>
      <Link className="inline-flex min-h-11 items-center text-sm underline" to="/">返回工作台首页</Link>
      {control && (defaultAllowed || recoveryMode) && <Link className="text-sm underline" to={defaultAllowed
        ? feature.entry! : `${feature.entry}?${control.parameter}=${recoveryMode![0]}`}>返回可用控制模式</Link>}
    </div>
  )
}
