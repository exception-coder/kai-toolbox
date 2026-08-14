import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { CommandPalette } from './CommandPalette'
import { featureAtPath, features } from './featureRegistry'
import { PwaInstallPrompt } from './PwaInstallPrompt'
import { useBrand } from './brand'
import { useMenuVisibilitySync } from './menuVisibility'
import { UnifiedTitleBar, UnifiedTitleBarSlotContext } from './UnifiedTitleBar'
import { useWindowControlsOverlay } from './useWindowControlsOverlay'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unifiedTitleBarSlot, setUnifiedTitleBarSlot] = useState<HTMLDivElement | null>(null)
  const collapsedRef = useRef(collapsed)
  const collapsedBeforeConsultRef = useRef<boolean | null>(null)
  const wasConsultRouteRef = useRef(false)
  const location = useLocation()
  const { brand } = useBrand()
  const windowControlsOverlayVisible = useWindowControlsOverlay()
  const shellless = location.pathname === '/tools/welfare-sign/fullscreen'
  const currentFeature = featureAtPath(location.pathname)
  const currentFeatureName = currentFeature?.name ?? (location.pathname === '/' ? '工作台' : undefined)
  const featureIntegratedTitleBar = windowControlsOverlayVisible && currentFeature?.id === 'claude-chat' && !shellless
  const isConsultRoute =
    location.pathname === '/tools/fore-consult' ||
    location.pathname.startsWith('/tools/fore-consult/')

  // 登录后把当前用户的菜单显隐从后端同步下来（未登录则 no-op，走本地兜底）。
  useMenuVisibilitySync()

  // 路由切换时关闭移动端抽屉
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useLayoutEffect(() => {
    collapsedRef.current = collapsed
  }, [collapsed])

  // 业务咨询以图谱为主舞台：进入时自动收起桌面侧栏，离开后恢复进入前的状态。
  // 仅在路由边界执行一次，用户留在模块内时仍可通过侧栏品牌行按钮手动展开。
  useLayoutEffect(() => {
    if (isConsultRoute && !wasConsultRouteRef.current) {
      collapsedBeforeConsultRef.current = collapsedRef.current
      collapsedRef.current = true
      setCollapsed(true)
    } else if (!isConsultRoute && wasConsultRouteRef.current) {
      const previous = collapsedBeforeConsultRef.current
      collapsedBeforeConsultRef.current = null
      if (previous !== null) {
        collapsedRef.current = previous
        setCollapsed(previous)
      }
    }
    wasConsultRouteRef.current = isConsultRoute
  }, [isConsultRoute])

  // 应用名同步到浏览器标签标题
  useEffect(() => {
    if (brand.appName) document.title = brand.appName
  }, [brand.appName])

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
    <UnifiedTitleBarSlotContext.Provider value={featureIntegratedTitleBar ? unifiedTitleBarSlot : null}>
    <div
      className="app-shell-canvas flex w-screen overflow-hidden text-[var(--color-foreground)]"
      style={{ height: 'var(--app-vh, 100vh)' }}
    >
      {windowControlsOverlayVisible && (
        <UnifiedTitleBar
          featureName={currentFeatureName}
          sidebarCollapsed={collapsed}
          onToggleSidebar={shellless ? undefined : () => setCollapsed(current => !current)}
          onOpenMobileMenu={shellless ? undefined : () => setMobileOpen(true)}
          featureSlotRef={setUnifiedTitleBarSlot}
          featureIntegrated={featureIntegratedTitleBar}
        />
      )}
      {shellless ? (
        <main className="scrollbar-autohide min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      ) : (
      <>
      {/* 桌面：常驻侧栏（md 及以上） */}
      <div className="hidden md:flex">
        <Sidebar
          features={features}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(current => !current)}
          hideBrandHeader={windowControlsOverlayVisible}
          titleBarIntegrated={featureIntegratedTitleBar}
        />
      </div>

      {/* 移动端：通过 Sheet 抽屉打开（宽度对齐 Sidebar 默认展开宽度 w-60） */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-60 max-w-[80vw] p-0"
          style={windowControlsOverlayVisible ? { paddingTop: 'var(--window-titlebar-height)' } : undefined}
          hideCloseButton
        >
          <SheetTitle className="sr-only">导航</SheetTitle>
          <Sidebar
            features={features}
            hideBrandHeader={windowControlsOverlayVisible}
            titleBarIntegrated={featureIntegratedTitleBar}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 桌面折叠控制已并入侧栏品牌行，避免为单个按钮常驻一条 48px 顶栏。 */}
        <TopBar
          onOpenMobileMenu={() => setMobileOpen(true)}
          hidden={windowControlsOverlayVisible}
        />
        {/* 模块高度以这里分配的 flex 可用空间为准；子页面应使用 h-full/min-h-full，
            不要再用 100vh 减 Shell 顶栏等固定像素。 */}
        <main className="scrollbar-autohide min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <PwaInstallPrompt />
      {/* 命令面板（Ctrl/⌘+K）：只挂一次，跨所有工具页可用 */}
      <CommandPalette />
      </>
      )}
    </div>
    </UnifiedTitleBarSlotContext.Provider>
  )
}
