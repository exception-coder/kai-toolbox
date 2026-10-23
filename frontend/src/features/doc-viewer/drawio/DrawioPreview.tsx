import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Maximize2, Minimize2, Scan, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { buildDrawioFrame } from './drawioFrame'
import { readDrawioPages, type DrawioPage } from './drawioDocument'

interface Props { content: string; name?: string }

export function DrawioPreview({ content, name = 'draw.io 图形' }: Props) {
  const [fullscreen, setFullscreen] = useState(false)
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [content])
  const portalContainer = useFullscreenPortalContainer()
  const restoreFocus = useRef<HTMLButtonElement>(null)
  return <>
    {!fullscreen && <DrawioCanvas content={content} name={name} page={page} onPageChange={setPage} onFullscreen={() => setFullscreen(true)} fullscreenRef={restoreFocus} />}
    <Dialog.Root open={fullscreen} onOpenChange={setFullscreen}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content className="fixed inset-0 z-[91] flex min-h-0 min-w-0 flex-col bg-[var(--color-background)] outline-none" onCloseAutoFocus={event => { event.preventDefault(); restoreFocus.current?.focus() }}>
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
            <div className="min-w-0 flex-1"><Dialog.Title className="truncate text-sm font-semibold">{name}</Dialog.Title><Dialog.Description className="text-xs text-[var(--color-muted-foreground)]">只读图形预览</Dialog.Description></div>
            <Dialog.Close asChild><Button variant="ghost" className="min-h-11"><Minimize2 className="size-4" />退出全屏</Button></Dialog.Close>
            <Dialog.Close asChild><Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="关闭全屏图形"><X className="size-4" /></Button></Dialog.Close>
          </div>
          <DrawioCanvas content={content} name={name} page={page} onPageChange={setPage} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}

function DrawioCanvas({ content, name, page, onPageChange, onFullscreen, fullscreenRef }: Props & { page: number; onPageChange: (page: number) => void; onFullscreen?: () => void; fullscreenRef?: React.Ref<HTMLButtonElement> }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [pages, setPages] = useState<DrawioPage[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const token = useMemo(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''), [content, attempt])
  const srcDoc = useMemo(() => buildDrawioFrame(window.location.origin, token), [token])
  const send = (action: string) => frameRef.current?.contentWindow?.postMessage({ token, action }, '*')

  useEffect(() => {
    let active = true
    setPages([]); setReady(false); setLoading(true); setError('')
    void readDrawioPages(content).then(result => { if (active) setPages(result) }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : '图文件无法读取，请重新选择。'); setLoading(false) }
    })
    return () => { active = false }
  }, [content, attempt])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== 'null' || event.data?.type !== 'forge-drawio' || event.data.token !== token) return
      if (event.data.state === 'ready') setReady(true)
      if (event.data.state === 'rendered') setLoading(false)
      if (event.data.state === 'error') { setError('图形渲染失败，请重试或切换源码检查文件。'); setLoading(false) }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [token])

  useEffect(() => {
    if (!ready || !pages[page]) return
    setLoading(true)
    // The sandbox has an opaque origin. Source identity and a per-frame token protect replies.
    frameRef.current?.contentWindow?.postMessage({ token, action: 'load', xml: pages[page].xml }, '*')
  }, [ready, pages, page, token])

  useEffect(() => {
    if (!loading || error) return
    const timer = window.setTimeout(() => { setError('图形加载超时，请重试；仍失败可切换源码或在 draw.io 中检查文件。'); setLoading(false) }, 20_000)
    return () => window.clearTimeout(timer)
  }, [loading, error, token, page])

  return <section aria-label={`${name} 图形预览`} className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
      {pages.length > 1 && <select aria-label="图形页面" value={page} onChange={event => onPageChange(Number(event.target.value))} className="mr-auto min-h-11 max-w-full rounded-md border bg-[var(--color-background)] px-2 text-sm">{pages.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select>}
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="放大图形" disabled={!ready || loading || !!error} onClick={() => send('zoom-in')}><ZoomIn className="size-4" /></Button>
      <Button variant="ghost" className="min-h-11 min-w-11" aria-label="缩小图形" disabled={!ready || loading || !!error} onClick={() => send('zoom-out')}><ZoomOut className="size-4" /></Button>
      <Button variant="ghost" className="min-h-11" disabled={!ready || loading || !!error} onClick={() => send('fit')}><Scan className="size-4" />适应窗口</Button>
      {onFullscreen && <Button ref={fullscreenRef} variant="ghost" className="min-h-11" onClick={onFullscreen}><Maximize2 className="size-4" />全屏</Button>}
    </div>
    <div className="relative min-h-48 min-w-0 flex-1 overflow-hidden bg-white">
      {!error && <iframe key={token} ref={frameRef} title={`${name} draw.io 画布`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={srcDoc} className="absolute inset-0 h-full w-full border-0" />}
      {loading && !error && <div role="status" className="absolute inset-0 space-y-4 bg-[var(--color-background)] p-6"><span className="text-sm">正在渲染图形…</span><div className="h-8 w-1/3 animate-pulse rounded bg-[var(--color-muted)] motion-reduce:animate-none" /><div className="h-24 w-2/3 animate-pulse rounded bg-[var(--color-muted)] motion-reduce:animate-none" /></div>}
      {error && <div role="alert" className="space-y-3 bg-[var(--color-background)] p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>重新加载图形</Button></div>}
    </div>
    <p className="shrink-0 border-t px-3 py-2 text-xs text-[var(--color-muted-foreground)]">本地只读渲染 · 外部图片、字体、链接和数学公式扩展不加载</p>
  </section>
}
