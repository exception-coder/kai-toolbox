import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { closePreview, type PreviewView } from './api'
import { INLINE_PREVIEW_SUPPRESS_PARAM, pagePreviewEntryFromHref, previewTargetFromSearch } from './previewEntry'
import { PagePreviewWorkspace } from './PagePreviewWorkspace'
import { PagePreviewDialog } from './PagePreviewDialog'
import './preview.css'
import type { InlinePreviewExpansion } from '../public-api/page-preview'

export function InlinePagePreview({ entries, expansion }: { entries: { path: string; label: string }[]; expansion?: InlinePreviewExpansion }) {
  const { user } = useAuth()
  const container = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)
  const [selected, setSelected] = useState(entries[0]?.path)
  const entry = entries.find(item => item.path === (expansion?.path ?? selected)) ?? entries[0]
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); setEntered(true); return }
    const observer = new IntersectionObserver(items => {
      const shown = items.some(item => item.isIntersecting)
      setVisible(shown); if (shown) setEntered(true)
    })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  if (!entry) return null
  return <section ref={container} data-inline-page-preview aria-label="消息内页面预览" className="inline-page-preview"
    onClick={event => event.stopPropagation()} onCopy={event => event.stopPropagation()}>
    <nav aria-label="选择页面预览" className="inline-preview-options">
      {entries.map(item => <button key={item.path} type="button" aria-pressed={entry.path === item.path} onClick={() => setSelected(item.path)}>{item.label}</button>)}
    </nav>
    {entered || expansion ? <InlinePreviewContent key={`${user?.userId ?? 'local'}:${entry.path}`} path={entry.path} label={entry.label} visible={visible || !!expansion} expansion={expansion} />
      : <p role="status" className="inline-preview-notice inline-preview-placeholder">进入阅读区域后显示页面预览。</p>}
  </section>
}

function InlinePreviewContent({ path, label, visible, expansion }: { path: string; label: string; visible: boolean; expansion?: InlinePreviewExpansion }) {
  const entry = useMemo(() => {
    try {
      const safe = pagePreviewEntryFromHref(path)
      if (!safe) return null
      const url = new URL(safe, window.location.origin)
      if (!url.pathname.split('/')[4] && !url.searchParams.get('route')) return null
      const target = previewTargetFromSearch(url.searchParams)
      if (!/^\/(?![\\/])/.test(target.route) || target.route.includes('\\')) return null
      const route = new URL(target.route, window.location.origin)
      // Previewing the chat must not recursively launch its own embedded previews.
      if (!target.resourceId) route.searchParams.set(INLINE_PREVIEW_SUPPRESS_PARAM, '1')
      const recursive = /^\/tools\/fore-consult\/preview(?:\/|$)/.test(route.pathname)
      return { target: { ...target, route: target.resourceId ? target.route : route.pathname + route.search + route.hash, requestKey: crypto.randomUUID() },
        id: url.pathname.split('/')[4], autoStart: url.searchParams.get('auto') === '1' && !recursive }
    } catch { return null }
  }, [path])
  const [id, setId] = useState(entry?.id)
  const [expanded, setExpanded] = useState(false)
  const owned = useRef<string | undefined>(undefined)
  const expandButton = useRef<HTMLButtonElement>(null)
  const adopt = useCallback((view: PreviewView) => { owned.current = view.id; setId(view.id) }, [])
  useEffect(() => () => { if (owned.current) void closePreview(owned.current).catch(() => { /* Server TTL handles an unreachable owned context. */ }) }, [])
  const showingDialog = expanded || !!expansion
  if (!entry) return <p role="alert" className="inline-preview-notice">预览入口不完整或不可用，请重新准备完整链接。</p>
  return <>
    <header className="inline-preview-header"><span>{label}</span>
      <button ref={expandButton} type="button" disabled={!id} aria-label={`全屏查看 ${label}`} onClick={() => setExpanded(true)}><Maximize2 size={16} /></button>
    </header>
    {!visible && <p role="status" className="sr-only">画面已暂停，回到阅读区域后继续。</p>}
    <div className="inline-preview-content">
      <PagePreviewWorkspace initial={entry.target} previewId={id} onOpened={adopt} embedded autoStart={entry.autoStart} active={visible && (!showingDialog || !id)} compact />
    </div>
    {showingDialog && id && <PagePreviewDialog entryPath={`/tools/fore-consult/preview/${encodeURIComponent(id)}`} onOpened={adopt}
      onClose={() => { setExpanded(false); expansion?.onClose() }} returnFocus={() => { if (expansion) expansion.returnFocus(); else expandButton.current?.focus({ preventScroll: true }) }} />}
  </>
}
