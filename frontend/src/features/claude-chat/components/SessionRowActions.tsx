import { useRef, useState, type ReactNode } from 'react'
import { Copy, Loader2, LockKeyhole, MoreHorizontal, Pencil, Pin, Tags, Trash2, Unlock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CopySessionIdButton } from './CopySessionIdButton'

interface Props {
  sessionId: string
  title: string
  favorite?: boolean
  favoriteBusy: boolean
  duplicating?: boolean
  duplicateBusy?: boolean
  planExpired?: boolean
  planBusy: boolean
  running: boolean
  onFavorite: () => void
  onDuplicate?: () => void
  onPlan: () => void
  onGroup: () => void
  onRename: () => void
  onDelete: () => void
}

/** 在列表中只占一个操作位，低频动作按会话展开。 */
export function SessionRowActions(props: Props) {
  const [open, setOpen] = useState(false)
  const handingOffFocus = useRef(false)
  const action = (label: string, icon: ReactNode, onClick: () => void, disabled = false, handoff = false, destructive = false) => (
    <button type="button" disabled={disabled} onClick={() => {
      handingOffFocus.current = handoff
      setOpen(false)
      onClick()
    }} className={cn(
      'flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)] disabled:opacity-40',
      destructive && 'text-[var(--color-destructive)]',
    )}>
      {icon}<span>{label}</span>
    </button>
  )

  return <Popover modal open={open} onOpenChange={value => { handingOffFocus.current = false; setOpen(value) }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`更多操作：${props.title}`} title="更多会话操作"
        className="relative z-10 mr-1 flex size-11 shrink-0 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" side="bottom" collisionPadding={12}
      aria-label={`会话操作：${props.title}`}
      className="pointer-events-auto z-[80] max-h-[var(--radix-popover-content-available-height)] w-56 max-w-[calc(100vw-24px)] overflow-y-auto p-1"
      onCloseAutoFocus={event => { if (handingOffFocus.current) event.preventDefault() }}>
      <p className="truncate border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]" title={props.title}>{props.title}</p>
      {action(props.favorite ? '取消置顶' : '置顶会话', props.favoriteBusy ? <Loader2 className="size-4 animate-spin" /> : <Pin className="size-4" />, props.onFavorite, props.favoriteBusy)}
      <CopySessionIdButton sessionId={props.sessionId} variant="menu" />
      {props.onDuplicate && action('复制会话配置', props.duplicating ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />, props.onDuplicate, props.duplicateBusy, true)}
      {action(props.planExpired ? '解锁过期规划' : '标记规划过期', props.planExpired ? <Unlock className="size-4" /> : <LockKeyhole className="size-4" />, props.onPlan, props.planBusy || props.running, true)}
      {props.running && <p className="px-3 pb-1 text-xs text-[var(--color-muted-foreground)]">运行中的会话需先中断</p>}
      {action('设置系统和需求分组', <Tags className="size-4" />, props.onGroup, false, true)}
      {action('重命名会话', <Pencil className="size-4" />, props.onRename, false, true)}
      <div className="mt-1 border-t border-[var(--color-border)] pt-1">
        {action('删除会话', <Trash2 className="size-4" />, props.onDelete, false, true, true)}
      </div>
    </PopoverContent>
  </Popover>
}
