import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMockMode } from './useMockMode'

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenMobileMenu: () => void
  collapsed: boolean
}

export function TopBar({ onToggleSidebar, onOpenMobileMenu, collapsed }: TopBarProps) {
  const qc = useQueryClient()
  const { enabled: mock, toggle: toggleMock } = useMockMode()
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined'
      ? document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )

  useEffect(() => {
    const root = document.documentElement
    if (dark) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [dark])

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
      <div className="flex items-center gap-2">
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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDark(d => !d)}
          title={dark ? '切到浅色' : '切到深色'}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  )
}
