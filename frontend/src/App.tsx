import { Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/shell/AppShell'
import { HomePage } from '@/shell/HomePage'
import { features } from '@/shell/featureRegistry'
import { RouteGuard } from '@/components/auth/RouteGuard'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        {features.flatMap(f =>
          f.routes.map(r => (
            <Route
              key={f.id + r.path}
              path={r.path}
              // 每个工具页都是 React.lazy 动态 import（代码分割），渲染时需 Suspense 边界托底。
              // fallback 只在该工具 chunk 首次下载期间一闪而过；首页/shell 不受影响。
              element={
                <RouteGuard feature={f}>
                  <Suspense fallback={<PageLoading />}>{r.element}</Suspense>
                </RouteGuard>
              }
            />
          ))
        )}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
      加载中…
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-muted-foreground)]">
      <div className="text-4xl font-bold tracking-tight">404</div>
      <div className="text-sm">页面不存在</div>
    </div>
  )
}
