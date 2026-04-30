import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/api'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import type { ToolDescriptor } from './types'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: () => http<ToolDescriptor[]>('/tools'),
  })

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Sidebar tools={tools} loading={isLoading} collapsed={collapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onToggleSidebar={() => setCollapsed(c => !c)} collapsed={collapsed} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
