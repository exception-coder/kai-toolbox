import { useEffect, useState } from 'react'
import { Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  onToggleSidebar: () => void
  collapsed: boolean
}

export function TopBar({ onToggleSidebar, collapsed }: TopBarProps) {
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
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} title="切换侧边栏">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex items-center gap-2">
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
