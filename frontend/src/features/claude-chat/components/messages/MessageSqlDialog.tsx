import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { Copy, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { readSessionSql } from '../../api'
import { SqlFileContent } from './SqlFileContent'

interface Props { sessionId: string; path: string; onClose: () => void; returnFocus: () => void }

/** SQL is literal read-only text, never interpreted as Markdown or executed. */
export function MessageSqlDialog({ sessionId, path, onClose, returnFocus }: Props) {
  const portal = useFullscreenPortalContainer()
  const [notice, setNotice] = useState<string | null>(null)
  const file = useQuery({
    queryKey: ['message-sql', sessionId, path],
    queryFn: async ({ signal }) => {
      const result = await readSessionSql(sessionId, path, signal)
      if (result.truncated || result.binary) throw new Error('未取得完整的 SQL 文件，请核对路径并重试。')
      return result
    },
    retry: false, refetchOnWindowFocus: false, staleTime: Infinity, gcTime: 0,
  })
  const title = path.replace(/\\/g, '/').split('/').pop() || 'SQL 文件'
  async function copy() {
    if (!file.data || file.isError) return
    try { await navigator.clipboard.writeText(file.data.content); setNotice('已复制 SQL 原文，未执行。') }
    catch { setNotice('复制不可用，请在下方代码中选择并复制原文。') }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40" />
    <Dialog.Content className="fixed inset-2 z-[81] flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-[var(--color-background)] outline-none sm:inset-6"
      onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
      <header className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <Dialog.Title className="truncate text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="truncate text-xs text-[var(--color-muted-foreground)]" title={path}>SQL 只读预览 · 不执行 · {path}</Dialog.Description>
        </div>
        <Button variant="ghost" className="min-h-11 min-w-11" aria-label="复制 SQL 原文" disabled={!file.data || file.isError || file.isFetching} onClick={() => void copy()}><Copy className="size-4" /></Button>
        <Button variant="ghost" className="min-h-11 min-w-11" aria-label="重新读取 SQL" disabled={file.isFetching} onClick={() => { setNotice(null); void file.refetch() }}><RefreshCw className="size-4" /></Button>
        <Dialog.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" aria-label="关闭 SQL 预览"><X className="size-4" /></Button></Dialog.Close>
      </header>
      {notice && <p role="status" className="shrink-0 border-b px-4 py-2 text-xs text-[var(--color-muted-foreground)]">{notice}</p>}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto">
        {file.isPending ? <p role="status" className="p-4 text-sm">正在读取 SQL 文件…</p>
          : file.isError ? <div role="alert" className="space-y-3 p-4 text-sm"><p>{file.error.message}</p><p>请核对文件路径与会话权限；可重试或关闭后继续对话。</p><Button variant="outline" disabled={file.isFetching} onClick={() => void file.refetch()}>重试读取</Button></div>
            : !file.data.content.trim() ? <p className="p-4 text-sm text-[var(--color-muted-foreground)]">这份 SQL 文件为空。</p>
              : <SqlFileContent content={file.data.content} />}
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
