import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { cn } from '@/lib/utils'
import { closePreview, type PreviewView } from './api'
import { pagePreviewEntryFromHref, previewTargetFromSearch } from './previewEntry'
import { PagePreviewWorkspace } from './PagePreviewWorkspace'

export function PagePreviewDialog({ entryPath, onClose, returnFocus }: { entryPath: string; onClose: () => void; returnFocus: () => void }) {
  const portal = useFullscreenPortalContainer()
  const entry = useMemo(() => {
    const safe = pagePreviewEntryFromHref(entryPath)
    if (!safe) return null
    const url = new URL(safe, window.location.origin)
    // Closing and reopening is an explicit new preview; do not reuse a CLOSED handoff context.
    return { target: { ...previewTargetFromSearch(url.searchParams), requestKey: crypto.randomUUID() }, id: url.pathname.split('/')[4] }
  }, [entryPath])
  const [id, setId] = useState(entry?.id)
  const [fullscreen, setFullscreen] = useState(false)
  const owned = useRef<string | undefined>(undefined)
  const opened = useCallback((view: PreviewView) => { owned.current = view.id; setId(view.id) }, [])
  useEffect(() => () => { if (owned.current) void closePreview(owned.current).catch(() => { /* The server TTL still bounds an unreachable context. */ }) }, [])
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40" />
    <Dialog.Content className={cn('fixed z-[81] flex min-h-0 min-w-0 flex-col overflow-hidden border bg-background outline-none', fullscreen ? 'inset-0' : 'inset-2 rounded-lg sm:inset-6')} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2"><div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold">登录并预览页面</Dialog.Title><Dialog.Description className="text-xs text-muted-foreground">使用运行环境账号 · 关闭后回到当前对话</Dialog.Description></div>
        <Button variant="ghost" className="min-h-11 min-w-11" aria-label={fullscreen ? '缩小页面预览' : '全屏页面预览'} onClick={() => setFullscreen(value => !value)}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</Button>
        <Dialog.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" aria-label="关闭页面预览"><X /></Button></Dialog.Close>
      </header>
      {entry ? <PagePreviewWorkspace initial={entry.target} previewId={id} onOpened={opened} embedded autoStart /> : <p role="alert" className="p-4 text-sm">预览链接无效，请重新准备不含凭据的预览入口。</p>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
