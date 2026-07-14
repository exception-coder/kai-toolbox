import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMockMode } from './useMockMode'
import { openCommandPalette } from './commandPaletteBus'

interface TopBarProps {
  onToggleSidebar: () => void
  onOpenMobileMenu: () => void
  collapsed: boolean
}

/**
 * 全局工具栏（Toolbar），压到 48px。定位升级后顶栏不再常驻某个「视频搜索框」——那只是几十个能力之一。
 * 中间改为一个打开命令面板（Ctrl/⌘+K）的紧凑触发器，统一「跳转任意模块 + 视频搜索」等能力（见 CommandPalette）。
 * 左侧仅留侧栏开合 + Mock 只读状态标；账号/主题/Mock 切换沉到左下账号菜单。
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

      {/* 中：命令面板触发器（Ctrl/⌘+K）。桌面显示为一枚克制的搜索按钮，移动端退化为图标。 */}
      <div className="flex min-w-0 flex-1 justify-center">
        {/* 桌面 */}
        <button
          type="button"
          onClick={openCommandPalette}
          title="搜索与跳转（Ctrl / ⌘ + K）"
          className="hidden h-8 w-full max-w-[420px] items-center gap-2 rounded-md border bg-[var(--color-muted)]/40 px-3 text-sm text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] md:flex"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left">搜索模块、跳转、视频…</span>
          <kbd className="shrink-0 rounded border bg-[var(--color-background)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums">Ctrl K</kbd>
        </button>
        {/* 移动端 */}
        <Button variant="ghost" size="icon" onClick={openCommandPalette} title="搜索与跳转" className="md:hidden">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* 右：与左侧开合按钮等宽的占位，使触发器视觉居中（顶栏其余操作已下沉账号菜单） */}
      <div className="w-9 shrink-0" aria-hidden />
    </header>
  )
}
