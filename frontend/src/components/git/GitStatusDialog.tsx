import { useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  showingDiff: boolean
  loading: boolean
  onBack: () => void
  onRefresh: () => void
  onClose: () => void
  restoreFocus?: () => void
  children: ReactNode
}

function WindowButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const label = expanded ? '还原窗口' : '全屏查看'
  return (
    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
      onClick={onToggle} aria-label={label} title={expanded ? '还原窗口（Esc）' : label} aria-pressed={expanded}>
      {expanded ? <Minimize2 /> : <Maximize2 />}
    </Button>
  )
}

/** 调整同一个弹层的尺寸，保留 diff 节点、请求结果和双栏滚动位置。 */
export function GitStatusDialog({ title, showingDiff, loading, onBack, onRefresh, onClose, restoreFocus, children }: Props) {
  const [expanded, setExpanded] = useState(false)
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" onClick={event => event.stopPropagation()} />
        <Dialog.Content aria-describedby={undefined}
          onClick={event => event.stopPropagation()}
          className={cn('fixed z-50 flex min-h-0 flex-col overflow-hidden bg-[var(--color-card)] outline-none',
            expanded ? 'inset-0 h-dvh w-full max-w-none' :
              'inset-x-3 top-4 mx-auto rounded-xl border shadow-xl sm:top-16',
            !expanded && (showingDiff
              ? 'h-[85dvh] max-h-[calc(100dvh-2rem)] max-w-5xl sm:max-h-[calc(100dvh-5rem)]'
              : 'max-h-[calc(100dvh-2rem)] max-w-lg sm:max-h-[75dvh]'))}
          onEscapeKeyDown={event => { if (expanded) { event.preventDefault(); setExpanded(false) } }}
          onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus) restoreFocus(); else returnFocus.current?.focus() }}>
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            {showingDiff && <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
              onClick={onBack} aria-label="返回文件列表" title="返回文件列表"><ArrowLeft /></Button>}
            <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>{title}</Dialog.Title>
            {!showingDiff && <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
              onClick={onRefresh} disabled={loading} title="刷新" aria-label="刷新">
              <RefreshCw className={cn(loading && 'animate-spin')} />
            </Button>}
            <WindowButton expanded={expanded} onToggle={() => setExpanded(value => !value)} />
            <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
              onClick={onClose} aria-label="关闭" title="关闭"><X /></Button>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
