import type { ReactNode } from 'react'
import { usePermission } from '@/shell/permission'

/**
 * 权限码显隐组件：持有 code（或超管）才渲染 children，否则渲染 fallback（默认不渲染）。
 * 用于页面内按钮 / 操作区的细粒度显隐（FR-FE-02）。
 *
 * <p>仅 UX 层；后端 @RequiresPermission 才是安全底线。</p>
 */
export function Permission({
  code,
  children,
  fallback = null,
}: {
  code: string
  children: ReactNode
  fallback?: ReactNode
}) {
  return usePermission(code) ? <>{children}</> : <>{fallback}</>
}
