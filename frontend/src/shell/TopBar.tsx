import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMockMode } from './useMockMode'

interface TopBarProps {
  onOpenMobileMenu: () => void
  hidden?: boolean
}

/**
 * 移动端菜单条。桌面端不再为单个侧栏开关占用整行空间，开关已迁入 Sidebar 品牌行；
 * 移动端没有常驻侧栏，仍需保留汉堡入口与 Mock 状态提示。
 */
export function TopBar({ onOpenMobileMenu, hidden = false }: TopBarProps) {
  const { enabled: mock } = useMockMode()

  if (hidden) return null

  return (
    <header className="appearance-chrome flex h-[var(--density-topbar-height)] items-center gap-2 border-b px-[var(--density-shell-padding)] md:hidden">
      <Button variant="ghost" size="icon" onClick={onOpenMobileMenu} title="打开导航" className="md:hidden">
        <Menu className="h-4 w-4" />
      </Button>
      {mock && (
        <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          MOCK 模式
        </span>
      )}
    </header>
  )
}
