import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { cn } from '@/lib/utils'
import { readSessionMarkdown } from '../../api'
import { Markdown } from '../Markdown'

interface Props {
  sessionId: string
  path: string
  onClose: () => void
  returnFocus: () => void
}

/** 原位只读文档预览；同一弹框承载相邻文档和全屏，不丢弃当前对话。 */
export function MessageMarkdownDialog({ sessionId, path, onClose, returnFocus }: Props) {
  const portal = useFullscreenPortalContainer()
  const [navigation, setNavigation] = useState([path])
  const currentPath = navigation[navigation.length - 1]
  const [fullscreen, setFullscreen] = useState(false)
  const [source, setSource] = useState(false)
  const fullscreenButton = useRef<HTMLButtonElement>(null)
  const titleElement = useRef<HTMLHeadingElement>(null)
  useEffect(() => { titleElement.current?.focus({ preventScroll: true }) }, [currentPath])
  const file = useQuery({
    queryKey: ['message-markdown', sessionId, currentPath],
    queryFn: async ({ signal }) => {
      const result = await readSessionMarkdown(sessionId, currentPath, signal)
      if (result.truncated || result.binary) throw new Error('未取得完整的 Markdown 文件，请核对路径并重试。')
      return result
    },
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  })
  const title = currentPath.replace(/\\/g, '/').split('/').pop() || 'Markdown 文档'
  const navigate = (next: string) => {
    if (next === currentPath || next.replace(/\\/g, '/') === file.data?.path.replace(/\\/g, '/')) return
    setSource(false)
    setNavigation(previous => [...previous, next])
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal container={portal}>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40" />
      <Dialog.Content
        className={cn('fixed z-[81] flex min-h-0 min-w-0 flex-col overflow-hidden border bg-[var(--color-background)] outline-none', fullscreen ? 'inset-0' : 'inset-3 rounded-lg sm:inset-6')}
        onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}
        onEscapeKeyDown={event => {
          if (fullscreen) { event.preventDefault(); setFullscreen(false); fullscreenButton.current?.focus() }
        }}
      >
        <header className="flex shrink-0 items-center gap-1 border-b px-3 py-2 sm:px-4">
          {navigation.length > 1 && <Button variant="ghost" className="min-h-11 min-w-11" aria-label="返回上一份文档" onClick={() => { setSource(false); setNavigation(previous => previous.slice(0, -1)) }}><ArrowLeft className="size-4" /></Button>}
          <div className="min-w-0 flex-1">
            <Dialog.Title ref={titleElement} tabIndex={-1} className="truncate text-base font-semibold outline-none">{title}</Dialog.Title>
            <Dialog.Description className="truncate text-xs text-[var(--color-muted-foreground)]" title={currentPath}>只读 Markdown 预览 · {currentPath}</Dialog.Description>
          </div>
          <Button variant="ghost" className="min-h-11 min-w-11" aria-label="重新读取 Markdown" disabled={file.isFetching} onClick={() => void file.refetch()}><RefreshCw className="size-4" /></Button>
          <Button ref={fullscreenButton} variant="ghost" className="min-h-11 min-w-11" aria-label={fullscreen ? '退出 Markdown 全屏' : '全屏查看 Markdown'} onClick={() => setFullscreen(value => !value)}>{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
          <Dialog.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" aria-label="关闭 Markdown 预览"><X className="size-4" /></Button></Dialog.Close>
        </header>
        <div className="flex shrink-0 gap-1 border-b px-3 py-1">
          <Button variant="ghost" className="min-h-11" aria-pressed={!source} disabled={!file.data} onClick={() => setSource(false)}>正文</Button>
          <Button variant="ghost" className="min-h-11" aria-pressed={source} disabled={!file.data} onClick={() => setSource(true)}>源码</Button>
        </div>
        <div key={currentPath} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-6">
          {file.isPending ? <p role="status" className="text-sm">正在读取 Markdown 文件…</p>
            : file.isError ? <div role="alert" className="space-y-3 text-sm"><p>{file.error.message}</p><p className="text-[var(--color-muted-foreground)]">请核对文件路径与会话权限；可重试、返回或关闭后继续对话。</p><Button variant="outline" disabled={file.isFetching} onClick={() => void file.refetch()}>重试读取</Button></div>
              : !file.data.content.trim() ? <p className="text-sm text-[var(--color-muted-foreground)]">这份 Markdown 文件为空。</p>
                : source ? <pre className="mx-auto max-w-5xl whitespace-pre-wrap break-words font-mono text-xs">{file.data.content}</pre>
                : <Markdown key={file.data.path} text={file.data.content} sessionId={sessionId} documentPath={file.data.path} onOpenMarkdown={navigate} className="mx-auto max-w-5xl text-sm leading-relaxed" />}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
