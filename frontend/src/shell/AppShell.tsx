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

  // 把 visualViewport.height 同步到 CSS 变量 --app-vh。
  // 移动端弹出软键盘时 window.innerHeight 在多数 Android Chrome 默认设置下不会变，
  // 但 visualViewport.height 会缩小为"键盘上方那部分"。直接把 shell 高度绑到
  // 这个值，整个 layout（侧栏、TopBar、main、子页面）会自动落在键盘上方，
  // 浏览器也不再需要 focus 自动滚动来露出输入框，避免与子页面手动改 height
  // 互相打架。CSS 变量比 React state 更省（不触发 re-render）。
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      document.documentElement.style.setProperty('--app-vh', `${vv.height}px`)
    }
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  return (
    <div
      className="flex w-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]"
      style={{ height: 'var(--app-vh, 100vh)' }}
    >
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
