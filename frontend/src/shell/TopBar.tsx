import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMockMode } from './useMockMode'
import { pathHasMock } from './featureRegistry'
import { GlobalVideoSearch } from './GlobalVideoSearch'
import { ThemeMenu } from './ThemeMenu'

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenMobileMenu: () => void
  collapsed: boolean
}

/**
 * 全局工具栏（Toolbar）——只放高频全局操作：折叠侧栏 · 全局搜索（重心） · 主题。
 * 按 AI IDE 惯例压到 52px、搜索居中放大占重心；用户/账号沉到侧边栏左下（低频，见 Sidebar 页脚）。
 * Mock 是本工具箱的联调开关，仅在当前模块支持或已全局开启时出现，属上下文操作留在右侧。
 */
export function TopBar({ onToggleSidebar, onOpenMobileMenu, collapsed }: TopBarProps) {
  const qc = useQueryClient()
  const { enabled: mock, toggle: toggleMock } = useMockMode()
  // 仅当前模块写了 mock 实现才展示 Mock 入口（没实现就别让人点，点了只会 404）。
  // 但若 mock 已全局开启，则任何页面都保留按钮，避免用户被困在无法关闭 mock 的页面。
  const { pathname } = useLocation()
  const showMock = pathHasMock(pathname) || mock

  return (
    <header className="flex h-[52px] items-center gap-3 border-b bg-[var(--color-background)] px-3">
      {/* 左：导航开合 + Mock 状态标（固定宽） */}
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

      {/* 中：全局搜索居中放大占重心（一天几十次的高频入口） */}
      <div className="flex min-w-0 flex-1 justify-center">
        <GlobalVideoSearch />
      </div>

      {/* 右：上下文/全局操作（固定宽） */}
      <div className="flex shrink-0 items-center gap-1.5">
        {showMock && (
          <Button
            variant={mock ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              toggleMock()
              qc.clear()
            }}
            title={mock ? '关闭 mock，恢复真实接口' : '开启 mock，使用本地模拟数据'}
            className={cn('gap-1.5', mock && 'border border-amber-500/40 text-amber-600 dark:text-amber-400')}
          >
            <FlaskConical className="h-4 w-4" />
            {mock ? 'Mock 已开启' : 'Mock'}
          </Button>
        )}
        <ThemeMenu />
      </div>
    </header>
  )
}
