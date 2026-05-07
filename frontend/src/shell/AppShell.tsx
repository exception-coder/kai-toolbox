import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { features } from './featureRegistry'
import { PwaInstallPrompt } from './PwaInstallPrompt'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // 路由切换时关闭移动端抽屉
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* 桌面：常驻侧栏（md 及以上） */}
      <div className="hidden md:flex">
        <Sidebar features={features} collapsed={collapsed} />
      </div>

      {/* 移动端：通过 Sheet 抽屉打开（宽度对齐 Sidebar 默认展开宽度 w-60） */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 max-w-[80vw] p-0" hideCloseButton>
          <SheetTitle className="sr-only">导航</SheetTitle>
          <Sidebar features={features} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          onToggleSidebar={() => setCollapsed(c => !c)}
          onOpenMobileMenu={() => setMobileOpen(true)}
          collapsed={collapsed}
        />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <PwaInstallPrompt />
    </div>
  )
}
