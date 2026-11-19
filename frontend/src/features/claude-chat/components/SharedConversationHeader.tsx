import { useRef, useState } from 'react'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WorkbenchThemeDialog } from './WorkbenchThemePicker'

export function SharedConversationHeader({ title, mode, onRefresh }: {
  title: string | null | undefined
  mode: '可回复' | '只读' | '正在核验' | '无访问权限'
  onRefresh?: () => void
}) {
  const [themeOpen, setThemeOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const hasAccess = mode === '只读' || mode === '可回复'
  return <header className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5 sm:px-4">
    <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
      <Link to="/" aria-label="返回 Forge 首页" title="返回 Forge 首页"><ArrowLeft /></Link>
    </Button>
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-base font-semibold">{title || '共享会话'}</h1>
      <p className="text-xs text-muted-foreground">{title ? '共享会话 · ' : ''}{mode}</p>
    </div>
    {hasAccess && <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
      <PopoverTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="icon" className="size-11 shrink-0"
        aria-label="更多共享会话选项"><MoreHorizontal /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        <Button type="button" variant="ghost" className="min-h-11 w-full justify-start"
          onClick={() => { setOptionsOpen(false); setThemeOpen(true) }}>工作台主题</Button>
        {onRefresh && <Button type="button" variant="ghost" className="min-h-11 w-full justify-start"
          onClick={() => { setOptionsOpen(false); onRefresh() }}>刷新</Button>}
      </PopoverContent>
    </Popover>}
    <WorkbenchThemeDialog open={themeOpen} onOpenChange={setThemeOpen} returnFocus={() => trigger.current?.focus()} />
  </header>
}
