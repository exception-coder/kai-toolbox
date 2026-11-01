import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Maximize2, MoreHorizontal, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DrawioViewState } from './drawioViewport'
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
  const memory = useRef({ content, views: new Map<number, DrawioViewState>() })
  if (memory.current.content !== content) memory.current = { content, views: new Map() }
  return <>
    {!fullscreen && <DrawioCanvas content={content} name={name} page={page} onPageChange={setPage} onFullscreen={() => setFullscreen(true)} fullscreenRef={restoreFocus} memory={memory.current.views} />}
    <Dialog.Root open={fullscreen} onOpenChange={setFullscreen}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content className="fixed inset-0 z-[91] flex min-h-0 min-w-0 flex-col bg-[var(--color-background)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] outline-none" onCloseAutoFocus={event => { event.preventDefault(); restoreFocus.current?.focus() }}>
          <Dialog.Title className="sr-only">{name}</Dialog.Title>
          <Dialog.Description className="sr-only">只读图纸阅读，点击看细节，适应窗口返回全貌。</Dialog.Description>
          <DrawioCanvas content={content} name={name} page={page} onPageChange={setPage} memory={memory.current.views} onExit={() => setFullscreen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}

function DrawioCanvas({ content, name, page, onPageChange, onFullscreen, fullscreenRef, onExit, memory }: Props & { page: number; onPageChange: (page: number) => void; onFullscreen?: () => void; fullscreenRef?: React.Ref<HTMLButtonElement>; onExit?: () => void; memory: Map<number, DrawioViewState> }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const exit = useRef(onExit)
  exit.current = onExit
  const [pages, setPages] = useState<DrawioPage[]>([])
  const [readyToken, setReadyToken] = useState('')
  const [view, setView] = useState<DrawioViewState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const token = useMemo(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''), [content, attempt, page])
  const ready = readyToken === token
  const srcDoc = useMemo(() => buildDrawioFrame(window.location.origin, token), [token])
  const send = (action: string) => frameRef.current?.contentWindow?.postMessage({ token, action }, '*')

  useEffect(() => {
    let active = true
    setPages([]); setLoading(true); setError('')
    void readDrawioPages(content).then(result => { if (active) setPages(result) }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : '图文件无法读取，请重新选择。'); setLoading(false) }
    })
    return () => { active = false }
  }, [content, attempt])

  useEffect(() => {
    setLoading(true); setError(''); setView(null)
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== 'null' || event.data?.type !== 'forge-drawio' || event.data.token !== token) return
      if (event.data.state === 'ready') setReadyToken(token)
      if (event.data.state === 'exit') exit.current?.()
      if (event.data.state === 'viewport') {
        const next = event.data.view as DrawioViewState | undefined
        if (next && [next.scale, next.x, next.y].every(Number.isFinite) && next.scale > 0 && typeof next.overview === 'boolean') {
          memory.set(page, next); setView(next)
        }
      }
      if (event.data.state === 'rendered') setLoading(false)
      if (event.data.state === 'error') { setError('图形渲染失败，请重试或切换源码检查文件。'); setLoading(false) }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [token, memory, page])

  useEffect(() => {
    if (!ready || !pages[page]) return
    setLoading(true)
    // The sandbox has an opaque origin. Source identity and a per-frame token protect replies.
    frameRef.current?.contentWindow?.postMessage({ token, action: 'load', xml: pages[page].xml, view: memory.get(page) }, '*')
  }, [ready, pages, page, token, memory])

  useEffect(() => {
    if (!loading || error) return
    const timer = window.setTimeout(() => { setError('图形加载超时，请重试；仍失败可切换源码或在 draw.io 中检查文件。'); setLoading(false) }, 20_000)
    return () => window.clearTimeout(timer)
  }, [loading, error, token, page])

  return <section aria-label={`${name} 图形预览`} className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex h-12 min-w-0 shrink-0 items-center gap-0.5 border-b px-1">
      {onExit && <Button variant="ghost" className="min-h-11 min-w-11 shrink-0 px-2" aria-label="关闭全屏图形" onClick={onExit}><ArrowLeft className="size-4" /></Button>}
      <select aria-label="图形页面" title={pages[page]?.name ?? name} value={page} disabled={!pages.length} onChange={event => onPageChange(Number(event.target.value))} className="h-11 min-w-0 flex-1 truncate rounded-md bg-transparent px-2 text-sm">
        {pages.length ? pages.map((item, index) => <option key={index} value={index}>{pages.length > 1 ? `${index + 1}/${pages.length} · ` : ''}{item.name}</option>) : <option value={0}>正在读取图纸…</option>}
      </select>
      <Button variant="ghost" className="min-h-11 min-w-11 shrink-0 px-2" aria-label="适应窗口" title="显示完整图纸" disabled={!ready || loading || !!error} onClick={() => send('fit')}><Scan className="size-4" /></Button>
      {onFullscreen && <Button ref={fullscreenRef} variant="ghost" className="min-h-11 min-w-11 shrink-0 px-2" aria-label="全屏图形" title="全屏阅读" onClick={onFullscreen}><Maximize2 className="size-4" /></Button>}
      <Popover><PopoverTrigger asChild><Button variant="ghost" className="min-h-11 min-w-11 shrink-0 px-2" aria-label="图纸阅读选项"><MoreHorizontal className="size-4" /></Button></PopoverTrigger>
        <PopoverContent align="end" className="z-[100] w-60 bg-[var(--color-background)] p-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="min-h-11 flex-1" aria-label="缩小图形" disabled={!ready || loading || !!error} onClick={() => send('zoom-out')}><ZoomOut className="size-4" /></Button>
            <span className="w-12 text-center text-xs tabular-nums">{view ? `${Math.round(view.scale * 100)}%` : '—'}</span>
            <Button variant="ghost" className="min-h-11 flex-1" aria-label="放大图形" disabled={!ready || loading || !!error} onClick={() => send('zoom-in')}><ZoomIn className="size-4" /></Button>
          </div>
          <Button variant="ghost" className="min-h-11 w-full justify-start" disabled={!ready || loading || !!error} onClick={() => send(view?.overview === false ? 'fit' : 'detail')}>{view?.overview === false ? '返回全貌' : '进入细节阅读'}</Button>
          <p className="px-2 py-1 text-xs text-[var(--color-muted-foreground)]">全貌可随对话滚动；点击图纸看细节，再双指缩放、拖动或双击还原。</p>
          <p className="border-t px-2 pt-2 text-xs text-[var(--color-muted-foreground)]">本地只读 · 外部图片、字体、链接和公式扩展暂不加载。</p>
        </PopoverContent>
      </Popover>
    </div>
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-white">
      {!error && <iframe key={token} ref={frameRef} title={`${name} draw.io 画布`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={srcDoc} className="absolute inset-0 h-full w-full border-0" />}
      {loading && !error && <div role="status" className="absolute inset-0 space-y-4 bg-[var(--color-background)] p-6"><span className="text-sm">正在渲染图形…</span><div className="h-8 w-1/3 animate-pulse rounded bg-[var(--color-muted)] motion-reduce:animate-none" /><div className="h-24 w-2/3 animate-pulse rounded bg-[var(--color-muted)] motion-reduce:animate-none" /></div>}
      {!loading && !error && view && <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[11px] text-slate-600">{view.overview ? '全貌 · 点击看细节' : `${Math.round(view.scale * 100)}% · 拖动平移，双击还原`}</div>}
      {error && <div role="alert" className="space-y-3 bg-[var(--color-background)] p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>重新加载图形</Button></div>}
    </div>

  </section>
}
