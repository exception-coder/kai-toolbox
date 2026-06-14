import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical, LogIn, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LoginDialog } from '@/components/auth/LoginDialog'
import { logout, useAuth } from '@/lib/auth'
import { useMockMode } from './useMockMode'
import { pathHasMock } from './featureRegistry'
import { GlobalVideoSearch } from './GlobalVideoSearch'
import { ThemeMenu } from './ThemeMenu'

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenMobileMenu: () => void
  collapsed: boolean
}

export function TopBar({ onToggleSidebar, onOpenMobileMenu, collapsed }: TopBarProps) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [showLogin, setShowLogin] = useState(false)
  const { enabled: mock, toggle: toggleMock } = useMockMode()
  // 仅当前模块写了 mock 实现才展示 Mock 入口（没实现就别让人点，点了只会 404）。
  // 但若 mock 已全局开启，则任何页面都保留按钮，避免用户被困在无法关闭 mock 的页面。
  const { pathname } = useLocation()
  const showMock = pathHasMock(pathname) || mock

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-[var(--color-background)] px-4">
      <div className="flex items-center gap-2">
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
      <GlobalVideoSearch />
      <div className="flex items-center gap-2">
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
        {user ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            title={`已登录：${user.username}（${user.roles.join(', ')}）— 点击登出`}
            onClick={() => { logout(); qc.clear() }}
          >
            <LogOut className="h-4 w-4" />
            <span className="max-w-24 truncate">{user.username}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="gap-1.5" title="登录" onClick={() => setShowLogin(true)}>
            <LogIn className="h-4 w-4" />
            登录
          </Button>
        )}
      </div>
      <LoginDialog open={showLogin} onClose={() => setShowLogin(false)} onSuccess={() => qc.clear()} />
    </header>
  )
}
