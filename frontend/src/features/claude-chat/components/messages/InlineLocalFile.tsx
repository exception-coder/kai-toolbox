import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Copy, FileText, Maximize2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DrawioPreview } from '@/features/doc-viewer/public-api/drawio'
import { readSessionDiagram, readSessionHtml, readSessionMarkdown, readSessionSql } from '../../api'
import { HtmlFileFrame } from './HtmlFileFrame'
import type { InlineFileReference } from '../../lib/inlineFilePreviews'

const Markdown = lazy(() => import('../Markdown').then(module => ({ default: module.Markdown })))
const SqlFileContent = lazy(() => import('./SqlFileContent').then(module => ({ default: module.SqlFileContent })))
const readers = { markdown: readSessionMarkdown, sql: readSessionSql, diagram: readSessionDiagram, html: readSessionHtml }
const keys = { markdown: 'message-markdown', sql: 'message-sql', diagram: 'message-drawio', html: 'message-html' }
const labels = { markdown: 'Markdown', sql: 'SQL', diagram: 'draw.io', html: 'HTML' }

/** Read Markdown on demand and load other inline files as they approach the viewport. */
export function InlineLocalFile({ sessionId, reference, onExpand }: {
  sessionId: string; reference: InlineFileReference; onExpand: (trigger: HTMLButtonElement) => void
}) {
  const container = useRef<HTMLElement>(null)
  const bodyId = useId()
  const [markdownExpanded, setMarkdownExpanded] = useState(false)
  const [visible, setVisible] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { kind, path, label } = reference
  const isMarkdown = kind === 'markdown'
  const showBody = !isMarkdown || markdownExpanded
  const shouldRead = isMarkdown ? markdownExpanded : visible
  useEffect(() => {
    if (isMarkdown) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px 0px' })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [isMarkdown])
  const file = useQuery({
    queryKey: [keys[kind], sessionId, path],
    queryFn: async ({ signal }) => {
      const result = await readers[kind](sessionId, path, signal)
      if (result.truncated || result.binary) throw new Error('未取得完整文件，请核对路径并重试。')
      return result
    },
    enabled: shouldRead, retry: false, refetchOnWindowFocus: false, staleTime: Infinity, gcTime: 0,
  })
  async function copy() {
    if (!file.data || file.isError) return
    try { await navigator.clipboard.writeText(file.data.content); setNotice('已复制原文。') }
    catch { setNotice('复制不可用，可展开后选择原文复制。') }
  }
  return <section ref={container} data-inline-file aria-label={`${labels[kind]} 文件预览：${label}`}
    onClick={event => event.stopPropagation()} onCopy={event => event.stopPropagation()}
    className="my-3 min-w-0 max-w-full overflow-hidden rounded-lg border bg-[var(--color-background)]">
    <header className={`flex min-w-0 items-center gap-1 px-2 ${showBody ? 'border-b' : ''}`}>
      {isMarkdown ? <Button variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start px-1"
        aria-expanded={markdownExpanded} aria-controls={markdownExpanded ? bodyId : undefined}
        aria-label={`${markdownExpanded ? '收起' : '展开'} Markdown 文件 ${label}`}
        onClick={() => { setNotice(null); setMarkdownExpanded(value => !value) }}>
        <FileText className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left text-xs" title={path}>{label}</span>
        {markdownExpanded ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
      </Button> : <span className="min-w-0 flex-1 truncate text-xs font-medium" title={path}>{label} · {labels[kind]}</span>}
      {showBody && <>
        <Button variant="ghost" className="min-h-11 min-w-11 px-2" aria-label={`复制文件原文 ${label}`} disabled={!file.data || file.isError || file.isFetching} onClick={() => void copy()}><Copy className="size-4" /></Button>
        <Button variant="ghost" className="min-h-11 min-w-11 px-2" aria-label={`刷新文件 ${label}`} disabled={!shouldRead || file.isFetching} onClick={() => { setNotice(null); void file.refetch() }}><RefreshCw className="size-4" /></Button>
        <Button variant="ghost" className="min-h-11 min-w-11 px-2" aria-label={isMarkdown ? `在弹框中阅读 Markdown 文件 ${label}` : `展开文件 ${label}`} onClick={event => onExpand(event.currentTarget)}><Maximize2 className="size-4" /></Button>
      </>}
    </header>
    {showBody && notice && <p role="status" className="px-3 py-2 text-xs">{notice}</p>}
    {showBody && <div id={bodyId} className={kind === 'diagram' || kind === 'html' ? 'h-96 min-w-0 overflow-hidden' : 'h-72 min-w-0 overflow-auto overscroll-contain [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto'}>
      {shouldRead && file.fetchStatus === 'paused' ? <p role="status" className="p-3 text-xs text-[var(--color-muted-foreground)]">当前处于离线状态，恢复连接后自动读取文件。</p>
        : !shouldRead || file.isPending ? <p role="status" className="p-3 text-xs text-[var(--color-muted-foreground)]">{shouldRead ? '正在读取文件…' : '进入阅读区域后自动显示…'}</p>
        : file.isError ? <div role="alert" className="space-y-2 p-3 text-sm"><p>{file.error.message}</p><Button variant="outline" disabled={file.isFetching} onClick={() => void file.refetch()}>重试读取</Button></div>
          : !file.data.content.trim() ? <p className="p-3 text-sm text-[var(--color-muted-foreground)]">文件为空。</p>
            : <Suspense fallback={<p role="status" className="p-3 text-xs">正在渲染文件…</p>}>
              {kind === 'diagram' ? <DrawioPreview content={file.data.content} name={file.data.name} />
                : kind === 'html' ? <HtmlFileFrame content={file.data.content} title={label} />
                : kind === 'sql' ? <SqlFileContent content={file.data.content} />
                  : <div className="p-3"><Markdown text={file.data.content} sessionId={sessionId} documentPath={file.data.path} /></div>}
            </Suspense>}
    </div>}
  </section>
}
