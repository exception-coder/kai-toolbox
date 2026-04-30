import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/shell/AppShell'
import { HomePage } from '@/shell/HomePage'
import { features } from '@/shell/featureRegistry'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        {features.flatMap(f =>
          f.routes.map(r => <Route key={f.id + r.path} path={r.path} element={r.element} />)
        )}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
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
