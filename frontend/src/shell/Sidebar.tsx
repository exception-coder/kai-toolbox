import { NavLink } from 'react-router-dom'
import { Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeatureManifest } from './types'
import { entryOf } from './featureRegistry'

interface SidebarProps {
  features: FeatureManifest[]
  collapsed?: boolean
}

export function Sidebar({ features, collapsed }: SidebarProps) {
  const groups = groupFeatures(features)

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <NavLink to="/" className="flex h-14 items-center gap-2 border-b px-4 hover:bg-[var(--color-sidebar-accent)]">
        <Boxes className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        {!collapsed && <span className="text-sm font-semibold tracking-tight">kai-toolbox</span>}
      </NavLink>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {features.length === 0 && !collapsed && (
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
