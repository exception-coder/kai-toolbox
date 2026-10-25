import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ExternalLink, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import type { SitePreviewTarget } from '@/lib/sitePreview'
import { cn } from '@/lib/utils'

interface Props {
  target: SitePreviewTarget
  onClose: () => void
  returnFocus: () => void
}

/** Browser-owned external page; Forge never proxies its contents or reads its login state. */
export function SitePreviewDialog({ target, onClose, returnFocus }: Props) {
  const portal = useFullscreenPortalContainer()
  const [fullscreen, setFullscreen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'unknown'>('loading')
  const mixedContent = window.location.protocol === 'https:' && new URL(target.url).protocol === 'http:'
  useEffect(() => {
    const timeout = window.setTimeout(() => setPhase('unknown'), 12_000)
    return () => window.clearTimeout(timeout)
  }, [attempt])
  const retry = () => { setPhase('loading'); setAttempt(value => value + 1) }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal container={portal}>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40" />
      <Dialog.Content className={cn('fixed z-[81] flex min-h-0 min-w-0 flex-col overflow-hidden border bg-[var(--color-background)] outline-none', fullscreen ? 'inset-0' : 'inset-2 rounded-lg sm:inset-8')} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
        <header className="flex shrink-0 flex-wrap items-center gap-x-1 border-b px-3 py-2">
          <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
            <Dialog.Title className="truncate text-base font-semibold">{target.title}</Dialog.Title>
            <Dialog.Description className="truncate text-xs text-[var(--color-muted-foreground)]" title={target.url}>{target.url}</Dialog.Description>
          </div>
          <Button variant="ghost" className="min-h-11 px-2" asChild><a href={target.url} target="_blank" rel="noopener noreferrer" aria-label="在新窗口打开站点"><ExternalLink className="size-4" /><span>新窗口</span></a></Button>
          <Button variant="ghost" className="min-h-11 min-w-11 px-2" aria-label="刷新站点预览" onClick={retry} disabled={mixedContent}><RefreshCw className="size-4" /></Button>
          <Button variant="ghost" className="min-h-11 min-w-11 px-2" aria-label={fullscreen ? '缩小站点预览' : '全屏站点预览'} onClick={() => setFullscreen(value => !value)}>{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
          <Dialog.Close asChild><Button variant="ghost" className="ml-auto min-h-11 min-w-11 px-2 sm:ml-0" aria-label="关闭站点预览"><X className="size-4" /></Button></Dialog.Close>
        </header>
        <div className="shrink-0 border-b px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
          页面空白或无法登录？可用新窗口打开。站点可能限制嵌入，证书与登录由浏览器处理。
        </div>
        {mixedContent ? <p role="alert" className="p-4 text-sm">当前是 HTTPS 工作台，无法嵌入 HTTP 站点。请使用上方“新窗口”打开，或提供 HTTPS 地址。</p> : <div className="relative min-h-0 flex-1 bg-white">
          {phase === 'loading' && <div role="status" className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b bg-[var(--color-background)] px-4 py-3 text-sm">正在连接站点…<div className="mt-2 h-1 w-1/3 animate-pulse rounded bg-[var(--color-muted)] motion-reduce:animate-none" /></div>}
          <iframe key={attempt} src={target.url} title={`${target.title} 站点预览`} className="h-full w-full border-0" sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts" referrerPolicy="no-referrer" onLoad={() => setPhase('unknown')} onError={() => setPhase('unknown')} />
        </div>}
        {!mixedContent && phase === 'unknown' && <p role="status" className="shrink-0 border-t px-3 py-2 text-xs text-[var(--color-muted-foreground)]">请核对页面是否正常显示；Forge 无法确认跨站页面的加载和登录结果。空白时可刷新或新窗口打开。</p>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
