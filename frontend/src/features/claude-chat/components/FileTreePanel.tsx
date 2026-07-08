import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, ExternalLink, FileText, Folder, FolderTree, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listSessionFiles, readSessionFile, revealSessionFile } from '../api'
import type { FileContent, FileEntry } from '../types'

interface Props {
  sessionId: string
  onClose: () => void
  /** 布局：panel=顶部折叠条（移动端）；side=右侧常驻栏（PC，类 Codex）。默认 panel。 */
  variant?: 'panel' | 'side'
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
  return `${(n / 1024 / 1024).toFixed(1)}M`
}

/**
 * 工作目录文件树（类 Codex 展开工作目录快速找文件）：懒加载列目录、按名筛选、
 * 点文件预览文本、每行「在文件管理器中定位」。后端按 sessionId 解析 cwd，相对路径校验防越权。
 */
export function FileTreePanel({ sessionId, onClose, variant = 'panel' }: Props) {
  const side = variant === 'side'
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [rootErr, setRootErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [preview, setPreview] = useState<FileContent | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewErr, setPreviewErr] = useState<string | null>(null)

  const loadDir = useCallback(async (path: string) => {
    setLoading(s => new Set(s).add(path))
    try {
      const list = await listSessionFiles(sessionId, path || undefined)
      setChildren(c => ({ ...c, [path]: list }))
      if (path === '') setRootErr(null)
    } catch (e) {
      if (path === '') setRootErr(errMsg(e))
    } finally {
      setLoading(s => { const n = new Set(s); n.delete(path); return n })
    }
  }, [sessionId])

  useEffect(() => { void loadDir('') }, [loadDir])

  const toggle = (path: string) => {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(path)) n.delete(path)
      else { n.add(path); if (!children[path]) void loadDir(path) }
      return n
    })
  }

  const openFile = async (path: string) => {
    setPreview(null); setPreviewErr(null); setPreviewLoading(true)
    try { setPreview(await readSessionFile(sessionId, path)) }
    catch (e) { setPreviewErr(errMsg(e)) }
    finally { setPreviewLoading(false) }
  }

  const reveal = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    revealSessionFile(sessionId, path).catch(() => { /* best-effort：资源管理器打开失败不打扰 */ })
  }

  const f = filter.trim().toLowerCase()

  const renderLevel = (path: string, depth: number): ReactNode => {
    const entries = children[path]
    if (!entries) return null
    const shown = f ? entries.filter(e => e.name.toLowerCase().includes(f)) : entries
    return shown.map(e => (
      <div key={e.path}>
        <div
          className="group flex items-center gap-1 rounded-md pr-1 hover:bg-[var(--color-muted)]"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <button
            type="button"
            onClick={() => (e.dir ? toggle(e.path) : void openFile(e.path))}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          >
            {e.dir ? (
              <ChevronRight className={cn('size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform', expanded.has(e.path) && 'rotate-90')} />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {e.dir
              ? <Folder className="size-3.5 shrink-0 text-[var(--color-primary)]" />
              : <FileText className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />}
            <span className="truncate text-xs">{e.name}</span>
            {loading.has(e.path) && <Loader2 className="size-3 shrink-0 animate-spin text-[var(--color-muted-foreground)]" />}
            {!e.dir && <span className="ml-1 shrink-0 text-[10px] text-[var(--color-muted-foreground)]">{fmtSize(e.size)}</span>}
          </button>
          <button
            type="button"
            onClick={ev => reveal(ev, e.path)}
            title="在文件管理器中定位"
            aria-label="在文件管理器中定位"
            className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] opacity-0 hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] group-hover:opacity-100"
          >
            <ExternalLink className="size-3.5" />
          </button>
        </div>
        {e.dir && expanded.has(e.path) && renderLevel(e.path, depth + 1)}
      </div>
    ))
  }

  return (
    <div className={side
      ? 'flex h-full w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-background)] text-sm lg:w-80'
      : 'border-b text-sm'}>
      <div className="flex items-center gap-2 px-3 py-2">
        <FolderTree className="size-4 text-[var(--color-primary)]" />
        <span className="font-medium">工作目录</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">展开找文件 · 悬停行可定位</span>
        <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
          <X className="size-4" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5 rounded-md border bg-[var(--color-background)] px-2">
          <Search className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="筛选当前已展开的文件/目录名"
            className="h-8 w-full bg-transparent text-xs focus-visible:outline-none"
          />
          {filter && (
            <button type="button" onClick={() => setFilter('')} aria-label="清空筛选" className="shrink-0 text-[var(--color-muted-foreground)]">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className={side ? 'min-h-0 flex-1 overflow-y-auto px-2 pb-2' : 'max-h-[52vh] overflow-y-auto px-2 pb-2'}>
        {rootErr && <p className="px-2 py-3 text-xs text-[var(--color-destructive)]">{rootErr}</p>}
        {!rootErr && !children[''] && <p className="px-2 py-3 text-xs text-[var(--color-muted-foreground)]">加载中…</p>}
        {children[''] && children[''].length === 0 && <p className="px-2 py-3 text-xs text-[var(--color-muted-foreground)]">空目录</p>}
        {renderLevel('', 0)}
      </div>

      {(preview || previewLoading || previewErr) && (
        <FilePreview
          content={preview}
          loading={previewLoading}
          error={previewErr}
          onReveal={() => preview && revealSessionFile(sessionId, preview.path).catch(() => {})}
          onClose={() => { setPreview(null); setPreviewErr(null) }}
        />
      )}
    </div>
  )
}

/** 文本文件预览浮层：顶栏文件名 + 大小 + 定位/关闭，正文等宽可滚动。二进制不预览。 */
function FilePreview({ content, loading, error, onReveal, onClose }: {
  content: FileContent | null
  loading: boolean
  error: string | null
  onReveal: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-label="文件预览">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-[var(--color-background)] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <FileText className="size-4 text-[var(--color-primary)]" />
          <span className="truncate text-sm font-semibold">{content?.name ?? '文件预览'}</span>
          {content && <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{fmtSize(content.size)}{content.truncated ? ' · 已截断' : ''}</span>}
          <button type="button" onClick={onReveal} title="在文件管理器中定位" className="ml-auto rounded-md p-1 hover:bg-[var(--color-muted)]" aria-label="定位">
            <ExternalLink className="size-4" />
          </button>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-[var(--color-muted)]" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && <p className="p-4 text-sm text-[var(--color-muted-foreground)]">加载中…</p>}
          {error && <p className="p-4 text-sm text-[var(--color-destructive)]">{error}</p>}
          {content?.binary && <p className="p-4 text-sm text-[var(--color-muted-foreground)]">二进制文件，无法预览。可用右上角「定位」在文件管理器中打开。</p>}
          {content && !content.binary && (
            <pre className="whitespace-pre-wrap break-words p-3 text-[12px] leading-relaxed">{content.content}</pre>
          )}
        </div>
      </div>
    </div>
  )
}
