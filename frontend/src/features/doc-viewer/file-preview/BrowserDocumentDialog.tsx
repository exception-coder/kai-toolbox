import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Code2, Eye, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/utils'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { MarkdownView } from '../components/MarkdownView'
import { RawTextView } from '../components/RawTextView'
import { TocPanel } from '../components/TocPanel'
import { chooseInitialViewMode, RAW_DEFAULT_THRESHOLD } from '../lib/sizeStrategy'
import { renderStandaloneHtml } from '../lib/renderStandaloneHtml'
import type { BrowserDocument } from './browserDocument'
import type { useBrowserDocuments } from './useBrowserDocuments'

const DrawioPreview = lazy(() => import('../drawio/DrawioPreview').then(module => ({ default: module.DrawioPreview })))

interface Props {
  files: ReturnType<typeof useBrowserDocuments>
  onChoose: () => void
  onReturnFocus: () => void
}

export function BrowserDocumentDialog({ files, onChoose, onReturnFocus }: Props) {
  const portalContainer = useFullscreenPortalContainer()
  const current = files.activeDocument
  return (
    <Dialog.Root open={files.open} onOpenChange={open => { if (!open) files.close() }}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="appearance-elevated-chrome fixed inset-3 z-50 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border text-[var(--color-popover-foreground)] shadow-lg outline-none sm:inset-6"
          onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus() }}
        >
          <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-base font-semibold" title={current?.name}>{current?.name ?? '直接打开文件'}</Dialog.Title>
              <Dialog.Description className="text-xs text-[var(--color-muted-foreground)]">{current ? `${formatBytes(current.size)} · ` : ''}临时预览 · 关闭后清除</Dialog.Description>
            </div>
            <Button type="button" variant="outline" className="min-h-11" onClick={onChoose} disabled={files.reading}>重新选择</Button>
            <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="关闭文件预览"><X className="size-4" /></Button></Dialog.Close>
            {files.documents.length > 1 && (
              <select aria-label="切换预览文件" value={files.activeId ?? ''} disabled={files.reading} onChange={event => files.selectDocument(Number(event.target.value))}
                className="min-h-11 w-full min-w-0 rounded-md border bg-[var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] sm:w-80">
                {files.documents.map(document => <option key={document.id} value={document.id}>{document.name}</option>)}
              </select>
            )}
          </header>
          {files.error && <p role="alert" className="shrink-0 border-b px-4 py-3 text-sm text-[var(--color-destructive)]">{files.error}</p>}
          {files.reading ? (
            <p role="status" className="flex items-center gap-2 px-4 py-6 text-sm"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />正在读取文件…</p>
          ) : current ? <BrowserDocumentContent key={current.id} document={current} /> : (
            <p className="px-4 py-6 text-sm">请重新选择支持的文件，或关闭返回文档浏览器。</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function BrowserDocumentContent({ document }: { document: BrowserDocument }) {
  const [source, setSource] = useState(document.kind === 'text' || (document.kind !== 'drawio' && chooseInitialViewMode(document.size) === 'raw'))
  const rootRef = useRef<HTMLDivElement | null>(null)
  const markdownRef = useRef<HTMLDivElement | null>(null)
  const html = useMemo(() => document.kind === 'html' ? renderStandaloneHtml(document.content) : '', [document])
  const showToc = !source && document.kind === 'markdown'
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-xs text-[var(--color-muted-foreground)]">{document.kind === 'drawio' ? 'draw.io 只读预览 · 可切换页面、缩放及全屏查看' : document.kind === 'html' ? 'HTML 静态预览；关联资源与交互请通过本地目录打开' : '关联文件与图片请通过本地目录打开'}{document.kind !== 'drawio' && document.size >= RAW_DEFAULT_THRESHOLD ? ' · 大文件默认显示源码' : ''}</p>
        {document.kind !== 'text' && <div className="flex gap-1">
          <Button type="button" variant={source ? 'ghost' : 'secondary'} className="min-h-11" aria-pressed={!source} onClick={() => setSource(false)}><Eye className="size-4" />预览</Button>
          <Button type="button" variant={source ? 'secondary' : 'ghost'} className="min-h-11" aria-pressed={source} onClick={() => setSource(true)}><Code2 className="size-4" />源码</Button>
        </div>}
      </div>
      {showToc && <details className="shrink-0 border-b px-4 py-2 lg:hidden"><summary className="cursor-pointer py-2 text-sm">大纲</summary><div className="max-h-48 overflow-y-auto py-2"><TocPanel rootRef={rootRef} contentKey={String(document.id)} showLabel={false} /></div></details>}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div ref={rootRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
          {source ? <RawTextView content={document.content} /> : document.kind === 'drawio' ? (
            <Suspense fallback={<p role="status" className="p-4 text-sm">正在打开图形预览…</p>}><DrawioPreview content={document.content} name={document.name} /></Suspense>
          ) : document.kind === 'html' ? (
            <iframe title={`${document.name} HTML 预览`} srcDoc={html} sandbox="" referrerPolicy="no-referrer" className="block h-full w-full border-0 bg-white" />
          ) : <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6"><MarkdownView content={document.content} size={document.size} contentKey={String(document.id)} rootRef={markdownRef} /></div>}
          {!document.content && <p className="px-4 py-6 text-sm text-[var(--color-muted-foreground)]">文件内容为空</p>}
        </div>
        {showToc && <aside aria-label="文档大纲" className="hidden w-64 shrink-0 overflow-y-auto border-l p-4 lg:block"><TocPanel rootRef={rootRef} contentKey={String(document.id)} /></aside>}
      </div>
    </div>
  )
}
