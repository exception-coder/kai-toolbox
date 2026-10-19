import { useEffect, useState, type ComponentType } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { useAccessContext } from '@/shell/permission'
import { cn } from '@/lib/utils'
import type { MarkdownCardPageProps } from '../pages/MarkdownCardPage'

const control = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm hover:bg-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-ring)] disabled:opacity-40'

/** An object action over the current conversation; the heavy editor loads only on demand. */
export function MarkdownCardDialog({ sourceText, onClose, returnFocus }: {
  sourceText: string; onClose: () => void; returnFocus?: () => void
}) {
  const portal = useFullscreenPortalContainer()
  const access = useAccessContext()
  const allowed = access.superAdmin || access.roles.includes('ADMIN')
    || access.permissionCodes.some(code => code === 'menu:content-tools' || code === 'menu:markdown-card')
  const [fullscreen, setFullscreen] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches)
  const [Editor, setEditor] = useState<ComponentType<MarkdownCardPageProps> | null>(null)
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!allowed) return
    let active = true
    setError(false)
    import('../pages/MarkdownCardPage').then(module => { if (active) setEditor(() => module.MarkdownCardPage) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [allowed, attempt])
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/35" />
    <Dialog.Content aria-busy={busy} data-fullscreen={fullscreen}
      onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus() } }}
      className={cn('fixed z-[101] flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]',
        fullscreen ? 'inset-0 h-dvh w-full' : 'left-1/2 top-1/2 h-[min(860px,90dvh)] w-[min(1200px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border')}>
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2 [padding-top:max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1"><Dialog.Title className="text-sm font-semibold">转卡片</Dialog.Title>
          <Dialog.Description className="text-xs text-[var(--color-muted-foreground)]">编辑、预览并导出图片，关闭后继续原对话。</Dialog.Description></div>
        <button type="button" className={control} disabled={busy} aria-label={fullscreen ? '缩小卡片编辑器' : '全屏卡片编辑器'}
          onClick={() => setFullscreen(value => !value)}>{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
        <Dialog.Close disabled={busy} aria-label="关闭卡片编辑器" className={control}><X className="size-4" /></Dialog.Close>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] md:p-4">
        {!allowed ? <p role="status" className="py-4 text-sm">尚未获得卡片工具权限，请联系管理员授权；可关闭后继续对话。</p>
          : error ? <div role="alert" className="space-y-3 py-4 text-sm"><p>卡片编辑器加载失败，原对话仍保留。</p><button className={control} onClick={() => setAttempt(value => value + 1)}>重新加载</button></div>
            : Editor ? <ErrorBoundary compact label="message-card-editor"><Editor embedded initialSourceText={sourceText} persist={false} initialMobileTab="preview" onExportBusyChange={setBusy} /></ErrorBoundary>
              : <div role="status" className="space-y-4"><p className="text-sm">正在加载卡片编辑器…</p><div className="h-11 animate-pulse rounded bg-[var(--color-muted)]" /><div className="h-64 animate-pulse rounded bg-[var(--color-muted)]" /></div>}
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
