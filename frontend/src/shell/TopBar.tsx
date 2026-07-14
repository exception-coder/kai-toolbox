import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMockMode } from './useMockMode'

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenMobileMenu: () => void
  collapsed: boolean
}

/**
 * 全局工具栏（Toolbar），压到 48px、极简。定位升级后顶栏不再固定任何搜索框——
 * 搜索/跳转统一走命令面板（Ctrl/⌘+K），入口放在左侧导航顶部（见 Sidebar），符合 Cursor/Linear 趋势。
 * 顶栏只留侧栏开合 + Mock 只读状态标；账号/主题/Mock 切换沉到左下账号菜单。
 */
export function TopBar({ onToggleSidebar, onOpenMobileMenu, collapsed }: TopBarProps) {
  const { enabled: mock } = useMockMode()

  return (
    <header className="flex h-12 items-center gap-2 border-b bg-[var(--color-background)] px-3">
      {/* 移动端：汉堡菜单打开抽屉 */}
      <Button variant="ghost" size="icon" onClick={onOpenMobileMenu} title="打开导航" className="md:hidden">
        <Menu className="h-4 w-4" />
      </Button>
      {/* 桌面：折叠/展开侧边栏 */}
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} title="切换侧边栏" className="hidden md:inline-flex">
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </Button>
      {mock && (
        <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          MOCK 模式
        </span>
      )}
    </header>
  )
}
