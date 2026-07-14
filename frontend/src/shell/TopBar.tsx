import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMockMode } from './useMockMode'
import { GlobalVideoSearch } from './GlobalVideoSearch'

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenMobileMenu: () => void
  collapsed: boolean
}

/**
 * 全局工具栏（Toolbar）——只负责「找什么」：全局搜索占据重心，别的全部让位。
 * 按 AI IDE（Cursor/Linear）趋势压到 48px；导航沉到左侧 Sidebar、账号/主题/Mock 沉到左下账号菜单，
 * 顶栏不再重复承载用户入口。左侧仅留一枚侧栏开合；Mock 生效时保留一个只读状态标提醒（切换在账号菜单）。
 */
export function TopBar({ onToggleSidebar, onOpenMobileMenu, collapsed }: TopBarProps) {
  const { enabled: mock } = useMockMode()

  return (
    <header className="flex h-12 items-center gap-3 border-b bg-[var(--color-background)] px-3">
      {/* 左：侧栏开合 + Mock 只读状态标（固定宽） */}
      <div className="flex shrink-0 items-center gap-2">
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
      </div>

      {/* 中：全局搜索占据重心（一天几十次的高频入口） */}
      <div className="flex min-w-0 flex-1 justify-center">
        <GlobalVideoSearch />
      </div>

      {/* 右：与左侧开合按钮等宽的占位，使搜索视觉居中（顶栏其余操作已下沉账号菜单） */}
      <div className="w-9 shrink-0" aria-hidden />
    </header>
  )
}
