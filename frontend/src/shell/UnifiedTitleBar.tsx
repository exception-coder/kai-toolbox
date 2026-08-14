import { createContext, useContext, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { useBrand } from './brand'
import { useMockMode } from './useMockMode'
import { cn } from '@/lib/utils'

interface UnifiedTitleBarProps {
  featureName?: string
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onOpenMobileMenu?: () => void
  featureSlotRef?: Ref<HTMLDivElement>
  featureIntegrated?: boolean
}

export const UnifiedTitleBarSlotContext = createContext<HTMLElement | null>(null)

/** Feature-owned header content can portal into the installed PWA title bar through this slot. */
export function useUnifiedTitleBarSlot(): HTMLElement | null {
  return useContext(UnifiedTitleBarSlotContext)
}

/** Installed desktop PWA title bar. Its geometry, drag region and control safe area live in CSS. */
export function UnifiedTitleBar({
  featureName,
  sidebarCollapsed = false,
  onToggleSidebar,
  onOpenMobileMenu,
  featureSlotRef,
  featureIntegrated = false,
}: UnifiedTitleBarProps) {
  const { brand } = useBrand()
  const { enabled: mock } = useMockMode()
  const showBrandText = !onToggleSidebar || !sidebarCollapsed

  return (
    <header className="unified-window-titlebar fixed inset-x-0 top-0" aria-label="应用窗口标题栏">
      <div className="unified-window-titlebar-safe">
        <div className={cn('unified-window-titlebar-brand w-16', showBrandText && 'md:w-60')}>
          <Link
            to="/"
            className={cn(
              'window-titlebar-interactive flex min-w-0 flex-1 items-center justify-center gap-2 self-stretch px-1 hover:bg-[var(--color-sidebar-accent)]',
              showBrandText && 'md:justify-start md:px-3',
            )}
            title="返回工作台"
          >
            <BrandLogo className="size-4 shrink-0" />
            {showBrandText && <span className="hidden truncate text-xs font-semibold tracking-tight md:inline">{brand.appName}</span>}
            {showBrandText && mock && (
              <span className="hidden shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400 md:inline">
                MOCK
              </span>
            )}
          </Link>
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="window-titlebar-interactive mr-1 flex size-6 shrink-0 items-center justify-center rounded text-[var(--color-muted-foreground)] hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-foreground)] md:hidden"
              title="打开导航"
              aria-label="打开导航"
            >
              <Menu className="size-3.5" />
            </button>
          )}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={cn(
                'window-titlebar-interactive mr-2 hidden size-6 shrink-0 items-center justify-center rounded text-[var(--color-muted-foreground)] hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-foreground)] md:flex',
                sidebarCollapsed && 'mr-1',
              )}
              title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="size-3.5" />
                : <PanelLeftClose className="size-3.5" />}
            </button>
          )}
        </div>
        <div
          ref={featureSlotRef}
          className={cn(
            'unified-window-titlebar-feature text-xs',
            featureIntegrated && 'unified-window-titlebar-feature-integrated',
          )}
          title={featureIntegrated ? undefined : featureName}
        >
          {!featureIntegrated && featureName && <span className="truncate font-medium">{featureName}</span>}
        </div>
      </div>
    </header>
  )
}
