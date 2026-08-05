import { Copy, ExternalLink, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { resolveSiteIcon } from '../lib/siteIcons'
import type { QuickSiteView } from '../types'

interface Props {
  site: QuickSiteView
  onOpen: (site: QuickSiteView) => void
  onCopy: (site: QuickSiteView) => void
  onEdit: (site: QuickSiteView) => void
  onTogglePin: (site: QuickSiteView) => void
  onDelete: (site: QuickSiteView) => void
}

export function QuickSiteCard({ site, onOpen, onCopy, onEdit, onTogglePin, onDelete }: Props) {
  const Icon = resolveSiteIcon(site.icon)
  const endpoint = displayEndpoint(site.siteUrl)

  return (
    <article
      className={cn(
        'group flex min-h-32 cursor-pointer flex-col rounded-lg border bg-[var(--color-card)] p-3 transition-colors hover:border-[var(--color-ring)] hover:bg-[var(--color-muted)]/20',
        !site.enabled && 'cursor-default opacity-55',
      )}
      onClick={() => site.enabled && onOpen(site)}
      onKeyDown={event => {
        if (event.target === event.currentTarget && site.enabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen(site)
        }
      }}
      role="button"
      tabIndex={site.enabled ? 0 : -1}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{site.title}</h3>
            {site.pinned && <Pin className="size-3 shrink-0 text-amber-500" />}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-muted-foreground)]" title={site.siteUrl}>
            {endpoint}
          </p>
        </div>
        <ExternalLink className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Badge variant="secondary" className="text-[10px]">{modeLabel(site.openMode)}</Badge>
        {!site.enabled && <Badge variant="outline" className="text-[10px]">已停用</Badge>}
        {site.openCount > 0 && (
          <span className="ml-auto text-[10px] text-[var(--color-muted-foreground)]">打开 {site.openCount} 次</span>
        )}
      </div>

      <div className="mt-auto flex justify-end gap-0.5 pt-2 opacity-70 transition-opacity group-hover:opacity-100">
        <CardAction label="复制链接" onClick={() => onCopy(site)}><Copy /></CardAction>
        <CardAction label={site.pinned ? '取消置顶' : '置顶'} onClick={() => onTogglePin(site)}>
          {site.pinned ? <PinOff /> : <Pin />}
        </CardAction>
        <CardAction label="编辑" onClick={() => onEdit(site)}><Pencil /></CardAction>
        <CardAction label="删除" destructive onClick={() => onDelete(site)}><Trash2 /></CardAction>
      </div>
    </article>
  )
}

function CardAction({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      className={cn('size-7', destructive && 'text-[var(--color-destructive)]')}
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </Button>
  )
}

function displayEndpoint(value: string) {
  try {
    const url = new URL(value)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return value
  }
}

function modeLabel(mode: QuickSiteView['openMode']) {
  if (mode === 'TAB') return '新标签页'
  if (mode === 'CURRENT') return '当前页面'
  return '独立窗口'
}
