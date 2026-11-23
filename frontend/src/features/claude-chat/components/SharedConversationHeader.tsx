import { useRef, useState } from 'react'
import { ArrowLeft, Info, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WorkbenchThemeDialog } from './WorkbenchThemePicker'
import { ReceivedShareNavigation, sharedActivityTime } from './ReceivedShareNavigation'
import type { SharedSession } from '../sessionSharingApi'

export function SharedConversationHeader({ title, mode, onRefresh, session }: {
  title: string | null | undefined
  mode: '可回复' | '只读' | '正在核验' | '无访问权限'
  onRefresh?: () => void
  session?: SharedSession | null
}) {
  const [themeOpen, setThemeOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const hasAccess = mode === '只读' || mode === '可回复'
  const activity = session && sharedActivityTime(session.lastSeenAt)
  return <header className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5 sm:px-4">
    {hasAccess && session && <ReceivedShareNavigation session={session} mobile />}
    <Button asChild variant="ghost" size="icon" className={`size-11 shrink-0 ${hasAccess && session ? 'hidden md:inline-flex' : ''}`}>
      <Link to="/" aria-label="返回 Forge 首页" title="返回 Forge 首页"><ArrowLeft /></Link>
    </Button>
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-base font-semibold">{title || '共享会话'}</h1>
      <p className="text-xs text-muted-foreground">{title ? '共享会话 · ' : ''}{mode}</p>
    </div>
    {hasAccess && session && <Popover>
      <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="会话信息"><Info /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-2">
        <h2 className="text-sm font-semibold">会话信息</h2>
        <dl className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2"><dt>权限</dt><dd>{mode}</dd></div>
          {session.engine && <div className="flex justify-between gap-2"><dt>引擎</dt><dd className="truncate capitalize">{session.engine}</dd></div>}
          {activity && <div className="flex justify-between gap-2"><dt>最近活动</dt><dd>{activity}</dd></div>}
        </dl>
      </PopoverContent>
    </Popover>}
    {hasAccess && <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
      <PopoverTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="icon" className="size-11 shrink-0"
        aria-label="更多共享会话选项"><MoreHorizontal /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        {session && <Button asChild variant="ghost" className="min-h-11 w-full justify-start md:hidden"><Link to="/">Forge 首页</Link></Button>}
        <Button type="button" variant="ghost" className="min-h-11 w-full justify-start"
          onClick={() => { setOptionsOpen(false); setThemeOpen(true) }}>工作台主题</Button>
        {onRefresh && <Button type="button" variant="ghost" className="min-h-11 w-full justify-start"
          onClick={() => { setOptionsOpen(false); onRefresh() }}>刷新</Button>}
      </PopoverContent>
    </Popover>}
    <WorkbenchThemeDialog open={themeOpen} onOpenChange={setThemeOpen} returnFocus={() => trigger.current?.focus()} />
  </header>
}
