import { Suspense } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { DrawioPreview } from '@/features/doc-viewer/public-api/drawio'
import { readSessionDiagram } from '../../api'

interface Props {
  sessionId: string
  path: string
  onClose: () => void
  returnFocus: () => void
}

export function MessageDrawioDialog({ sessionId, path, onClose, returnFocus }: Props) {
  const portal = useFullscreenPortalContainer()
  const file = useQuery({
    queryKey: ['message-drawio', sessionId, path],
    queryFn: async ({ signal }) => {
      const result = await readSessionDiagram(sessionId, path, signal)
      if (result.truncated || result.binary) throw new Error('未取得完整的图文件，请核对路径并重试。')
      return result
    },
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  })
  const title = path.replace(/\\/g, '/').split('/').pop() || 'draw.io 图形'
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal container={portal}>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40" />
      <Dialog.Content className="fixed inset-3 z-[81] flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-[var(--color-background)] outline-none sm:inset-6" onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
        <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="truncate text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="truncate text-xs text-[var(--color-muted-foreground)]" title={path}>只读图形预览 · {path}</Dialog.Description>
          </div>
          <Button variant="ghost" className="min-h-11 min-w-11" aria-label="重新读取图文件" disabled={file.isFetching} onClick={() => void file.refetch()}><RefreshCw className="size-4" /></Button>
          <Dialog.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" aria-label="关闭图文件预览"><X className="size-4" /></Button></Dialog.Close>
        </header>
        {file.isPending ? <LoadingDiagram /> : file.isError ? <div role="alert" className="space-y-3 p-4 text-sm"><p>{file.error.message}</p><p className="text-[var(--color-muted-foreground)]">请确认文件仍存在且属于会话或已登记项目；关闭后可继续对话。</p><Button variant="outline" onClick={() => void file.refetch()} disabled={file.isFetching}>重试读取</Button></div> : <Suspense fallback={<LoadingDiagram />}><DrawioPreview content={file.data.content} name={file.data.name} /></Suspense>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

function LoadingDiagram() {
  return <div role="status" className="space-y-4 p-4 text-sm"><p>正在读取图文件…</p><div className="h-8 w-1/3 animate-pulse rounded bg-[var(--color-muted)] motion-reduce:animate-none" /><div className="h-24 w-2/3 animate-pulse rounded bg-[var(--color-muted)] motion-reduce:animate-none" /></div>
}
