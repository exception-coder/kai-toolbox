import { NavLink } from 'react-router-dom'
import { Boxes, type LucideIcon, HardDrive, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolDescriptor } from './types'

const ICONS: Record<string, LucideIcon> = {
  'hard-drive': HardDrive,
  'wrench': Wrench,
}

interface SidebarProps {
  tools: ToolDescriptor[]
  loading?: boolean
  collapsed?: boolean
}

export function Sidebar({ tools, loading, collapsed }: SidebarProps) {
  const groups = groupTools(tools)

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Boxes className="h-5 w-5 text-[var(--color-primary)]" />
        {!collapsed && <span className="text-sm font-semibold tracking-tight">kai-toolbox</span>}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {loading && !collapsed && (
          <div className="px-2 py-1 text-xs text-[var(--color-muted-foreground)]">加载中…</div>
        )}
        {groups.map(({ group, items }) => (
          <div key={group ?? '_'} className="mb-3">
            {!collapsed && group && (
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {group}
              </div>
            )}
            <ul className="space-y-0.5">
              {items.map(t => {
                const Icon = ICONS[t.icon] ?? Wrench
                return (
                  <li key={t.id}>
                    <NavLink
                      to={t.route}
                      title={t.name}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                          'hover:bg-[var(--color-sidebar-accent)]',
                          isActive && 'bg-[var(--color-sidebar-accent)] font-medium text-[var(--color-foreground)]'
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{t.name}</span>}
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

function groupTools(tools: ToolDescriptor[]) {
  const map = new Map<string | null, ToolDescriptor[]>()
  for (const t of tools) {
    const k = t.group ?? null
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(t)
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}
