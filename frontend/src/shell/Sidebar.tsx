import { NavLink } from 'react-router-dom'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from './BrandLogo'
import { useAuth } from '@/lib/auth'
import type { FeatureManifest } from './types'
import { entryOf } from './featureRegistry'
import { hasFeatureAccess } from './access'
import { useVisibleFeatures } from './menuVisibility'
import { openCommandPalette } from './commandPaletteBus'
import { AccountMenu } from './AccountMenu'
import { useBrand } from './brand'

interface SidebarProps {
  features: FeatureManifest[]
  collapsed?: boolean
}

export function Sidebar({ features, collapsed }: SidebarProps) {
  const { user } = useAuth()
  const { brand } = useBrand()
  // 先按当前账号角色过滤：无权模块不出现在菜单（与路由 RouteGuard 配套）。chrome（管理页）不进功能菜单，改由账号菜单呈现。
  const allowed = features.filter(f => !f.chrome && hasFeatureAccess(f, user?.roles ?? []))
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
        <BrandLogo className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">{brand.appName}</span>}
      </NavLink>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* 搜索/跳转入口：打开命令面板（Ctrl/⌘+K）。放导航顶部，取代原顶栏搜索框。 */}
        <button
          type="button"
          onClick={openCommandPalette}
          title="搜索与跳转（Ctrl / ⌘ + K）"
          className={cn(
            'mb-3 flex w-full items-center gap-2.5 rounded-md border border-[var(--color-sidebar-border)] bg-[var(--color-background)]/60 px-2.5 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-sidebar-accent)]',
            collapsed && 'justify-center px-0'
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">搜索</span>
              <kbd className="shrink-0 rounded border bg-[var(--color-sidebar)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums">Ctrl K</kbd>
            </>
          )}
        </button>
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

      {/* 用户/配置沉到左下角：低频入口，向上弹出账号菜单（外观/Mock/退出）。折叠态只留头像。 */}
      <AccountMenu collapsed={collapsed} />
    </aside>
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
