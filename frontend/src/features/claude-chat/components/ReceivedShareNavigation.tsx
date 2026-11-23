import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Menu, Search, Share2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { listSharedSessions, sharedSessionPath, type SharedSession } from '../sessionSharingApi'

export function sharedActivityTime(timestamp: number) {
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
}

export function ReceivedShareNavigation({ session, mobile = false }: { session: SharedSession; mobile?: boolean }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [replyOnly, setReplyOnly] = useState(false)
  const received = useQuery({
    queryKey: ['claude-chat-received-shares', user?.userId],
    queryFn: listSharedSessions,
    enabled: !!user && (!mobile || open),
    retry: false,
  })
  const list = received.isError ? [] : received.data ?? []
  const keyword = search.trim().toLowerCase()
  const sessions = list.filter(item => (!replyOnly || item.collaborate)
    && (item.title || '共享会话').toLowerCase().includes(keyword))
  const content = <>
    <div className="shrink-0 space-y-2 px-3 pb-3">
      <label className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input aria-label="搜索共享会话" placeholder="搜索会话" value={search} onChange={event => setSearch(event.target.value)}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={replyOnly} onChange={event => setReplyOnly(event.target.checked)} /> 只看可回复
      </label>
    </div>
    <nav aria-label="收到的共享会话" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
      {received.isError && <p role="status" className="px-2 pb-2 text-xs text-muted-foreground">
        列表加载失败 <button type="button" className="underline" onClick={() => void received.refetch()}>重试</button>
      </p>}
      {received.isFetching && !received.data && <p role="status" className="px-2 pb-2 text-xs text-muted-foreground">正在读取会话列表…</p>}
      {sessions.length ? <ul className="space-y-0.5">
        {sessions.map(item => {
          const selected = item.id === session.id
          const time = sharedActivityTime(item.lastSeenAt)
          return <li key={item.id}>
            <Link to={sharedSessionPath(item.id)} aria-current={selected ? 'page' : undefined}
              onClick={event => {
                if (event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey) {
                  if (selected) event.preventDefault()
                  setOpen(false)
                }
              }}
              className={cn('block rounded-md px-2.5 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected && 'bg-primary/10 text-primary hover:bg-primary/10')}>
              <span className="block truncate font-medium" title={item.title ?? undefined}>{item.title || '共享会话'}</span>
              <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">{item.collaborate ? '可回复' : '只读'}</span>
                {time && <span className="truncate tabular-nums" title={`最近活动 ${time}`}>{time}</span>}
              </span>
            </Link>
          </li>
        })}
      </ul> : received.isSuccess && <p className="px-2 py-3 text-xs text-muted-foreground">
        {list.length ? '没有符合条件的共享会话' : '暂无收到的共享会话'}
      </p>}
    </nav>
  </>
  if (!mobile) return <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/25 md:flex xl:w-72">
    <h2 className="flex items-center gap-2 px-3 py-4 text-sm font-semibold"><Share2 aria-hidden="true" className="size-4" />我收到的共享会话</h2>
    {content}
  </aside>
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 md:hidden" aria-label="我收到的共享会话"><Menu /></Button>
    </SheetTrigger>
    <SheetContent side="left" aria-describedby={undefined} className="flex min-h-0 flex-col">
      <SheetTitle className="px-3 py-4 pr-10">我收到的共享会话</SheetTitle>
      {content}
    </SheetContent>
  </Sheet>
}
