import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Boxes, LogIn, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout, useAuth } from '@/lib/auth'
import { LoginDialog } from '@/components/auth/LoginDialog'
import type { FeatureManifest } from './types'
import { entryOf } from './featureRegistry'
import { hasFeatureAccess } from './access'
import { useVisibleFeatures } from './menuVisibility'
import { useBrand } from './brand'

interface SidebarProps {
  features: FeatureManifest[]
  collapsed?: boolean
}

export function Sidebar({ features, collapsed }: SidebarProps) {
  const { user } = useAuth()
  const { brand } = useBrand()
  // 先按当前账号角色过滤：无权模块不出现在菜单（与路由 RouteGuard 配套）。
  const allowed = features.filter(f => hasFeatureAccess(f, user?.roles ?? []))
  // 再按「菜单配置」的软隐藏过滤：管理员勾掉的模块不显示入口（路由仍在，勾回来即时恢复）。
  const visible = useVisibleFeatures(allowed)
  const groups = groupFeatures(visible)

  return (
    <aside
      className={cn(
        // h-full 保证移动端 Sheet 里 aside 撑满抽屉高度，否则下方 nav 的 overflow-y-auto 失去参照系，菜单超出视口就既看不到也滑不动
        'flex h-full flex-col border-r bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <NavLink to="/" className="flex h-14 items-center gap-2 border-b px-4 hover:bg-[var(--color-sidebar-accent)]">
        <Boxes className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">{brand.appName}</span>}
      </NavLink>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visible.length === 0 && !collapsed && (
          <div className="px-2 py-1 text-xs text-[var(--color-muted-foreground)]">
            还没有任何工具
          </div>
        )}
        {groups.map(({ group, items }) => (
          <div key={group ?? '_'} className="mb-3">
            {!collapsed && group && (
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {group}
              </div>
            )}
            <ul className="space-y-0.5">
              {items.map(f => {
                const Icon = f.icon
                return (
                  <li key={f.id}>
                    <NavLink
                      to={entryOf(f)}
                      title={f.name}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                          'hover:bg-[var(--color-sidebar-accent)]',
                          isActive && 'bg-[var(--color-sidebar-accent)] font-medium text-[var(--color-foreground)]'
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{f.name}</span>}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 用户信息沉到左下角：低频入口（一天点几次），不占顶栏黄金位。折叠态只留头像。 */}
      <SidebarUserFooter collapsed={collapsed} />
    </aside>
  )
}

/** 侧栏页脚的用户区：已登录显示头像+用户名+角色（点击登出），未登录显示登录入口。 */
function SidebarUserFooter({ collapsed }: { collapsed?: boolean }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [showLogin, setShowLogin] = useState(false)
  const roleLabel = user?.roles?.[0] ?? ''

  return (
    <div className="border-t p-2">
      {user ? (
        <button
          type="button"
          onClick={() => { logout(); qc.clear() }}
          title={`已登录：${user.username}（${user.roles.join(', ')}）— 点击登出`}
          className={cn(
            'group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--color-sidebar-accent)]',
            collapsed && 'justify-center px-0'
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">{user.username}</span>
                {roleLabel && (
                  <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">{roleLabel}</span>
                )}
              </span>
              <LogOut className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-foreground)]" />
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowLogin(true)}
          title="登录"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--color-sidebar-accent)]',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogIn className="h-4 w-4 shrink-0" />
          {!collapsed && <span>登录</span>}
        </button>
      )}
      <LoginDialog open={showLogin} onClose={() => setShowLogin(false)} onSuccess={() => qc.clear()} />
    </div>
  )
}

function groupFeatures(items: FeatureManifest[]) {
  const map = new Map<string | null, FeatureManifest[]>()
  for (const f of items) {
    const k = f.group ?? null
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(f)
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}
