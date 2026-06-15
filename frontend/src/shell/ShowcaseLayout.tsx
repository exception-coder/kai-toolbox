import { Suspense } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { ThemeMenu } from './ThemeMenu'

/**
 * 展示型外壳：脱离 AppShell（无 Sidebar / TopBar），整页 edge-to-edge 交给子页面，
 * 用于 Hero / 信息图 / 架构蓝图这类「讲故事」的展示页（产品官网风，非后台 CRUD 风）。
 * 只保留一组悬浮控件：返回工作台 + 主题切换；其余像素全部留给内容。
 */
export function ShowcaseLayout() {
  return (
    <div className="relative min-h-screen w-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* 悬浮控件：固定右上，毛玻璃，不占文档流，不打扰展示内容 */}
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
        <Link
          to="/"
          title="返回工作台"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3 py-1.5 text-xs font-medium text-[var(--color-muted-foreground)] backdrop-blur transition-colors hover:text-[var(--color-foreground)]"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          返回工作台
        </Link>
        <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/70 backdrop-blur">
          <ThemeMenu />
        </div>
      </div>

      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            加载中…
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </div>
  )
}
