import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CornerDownLeft, Film, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { entryOf, features } from './featureRegistry'
import { hasFeatureAccess } from './access'
import { onOpenCommandPalette } from './commandPaletteBus'
import { getVideoLibrary } from '@/features/video-library/api'
import { useVideoLibraryConfig } from '@/features/video-library/components/ExcludedDirsSheet'
import { VideoThumb } from '@/features/video-library/components/VideoThumb'
import type { VideoLibraryItem } from '@/features/video-library/types'

const VIDEO_LIMIT = 6

type NavRow = { kind: 'nav'; id: string; name: string; group?: string; icon: (typeof features)[number]['icon']; to: string }
type VideoRow = { kind: 'video'; id: string; item: VideoLibraryItem }
type Row = NavRow | VideoRow

/**
 * 命令面板（Ctrl/⌘+K）——Forge 的统一入口：跳转到任意模块 + 视频搜索等能力。
 *
 * 定位升级后，视频搜索不再常驻顶部黄金位，而是作为面板里的一项能力；搜索入口改为侧栏「搜索」按钮 + 本快捷键。
 * 跳转列表来自 featureRegistry，只按角色过滤——命令面板可达全部有权限的模块（含菜单里默认收起的），
 * 这正是它的意义：菜单只留核心几个，其余靠 Ctrl/⌘+K 触达。视频区仅在有权访问视频库时出现。
 * 只挂载一次（AppShell），自身监听 Ctrl/⌘+K 开合与 Esc 关闭。
 */
export function CommandPalette() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  // 全局快捷键：Ctrl/⌘+K 开合；程序化打开事件（顶栏触发器）；打开时聚焦、重置输入。
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    const off = onOpenCommandPalette(() => setOpen(true))
    return () => { window.removeEventListener('keydown', onKey); off() }
  }, [])

  useEffect(() => {
    if (open) {
      setInput('')
      setQuery('')
      setHighlight(0)
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open])

  // 300ms debounce（与原视频搜索一致），避免逐键请求。
  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === query) return
    const t = window.setTimeout(() => setQuery(trimmed), 300)
    return () => window.clearTimeout(t)
  }, [input, query])

  const roles = user?.roles ?? []

  // 跳转项：面板可直达所有「有权访问」的模块（含菜单里被隐藏的）——这正是命令面板的意义：菜单只留核心，其余靠它触达。
  const navRows = useMemo<NavRow[]>(() => {
    const q = query.toLowerCase()
    return features
      .filter((f) => hasFeatureAccess(f, roles))
      .filter((f) => !q || `${f.name} ${f.group ?? ''} ${f.id}`.toLowerCase().includes(q))
      .map((f) => ({ kind: 'nav' as const, id: f.id, name: f.name, group: f.group, icon: f.icon, to: entryOf(f) }))
  }, [query, roles])

  // 视频库可访问才启用视频搜索（无权则不显示视频区）。
  const videoFeature = features.find((f) => f.id === 'video-library')
  const canVideo = !!videoFeature && hasFeatureAccess(videoFeature, roles)
  const { config: libraryConfig } = useVideoLibraryConfig()
  const excludedDirs = libraryConfig.excludedDirs
  const videoResult = useQuery({
    queryKey: ['cmdk-video', query, excludedDirs.join('\n')],
    queryFn: () => getVideoLibrary('name', 'asc', 'all', query, false, '', excludedDirs, 0, VIDEO_LIMIT),
    enabled: open && canVideo && query.length > 0,
    staleTime: 30_000,
  })
  const videoRows = useMemo<VideoRow[]>(
    () => (videoResult.data?.items ?? []).map((item) => ({ kind: 'video' as const, id: `v:${item.path}`, item })),
    [videoResult.data],
  )

  const rows = useMemo(() => [...navRows, ...videoRows], [navRows, videoRows])
  useEffect(() => { setHighlight(0) }, [query])

  const activate = (row: Row) => {
    if (row.kind === 'nav') navigate(row.to)
    else navigate('/tools/video-library', { state: { playItem: row.item } })
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (rows.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % rows.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + rows.length) % rows.length) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[highlight] ?? rows[0]; if (r) activate(r) }
  }

  if (!open) return null

  const navCount = navRows.length

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[600px] overflow-hidden rounded-xl border bg-[var(--color-popover)] text-[var(--color-popover-foreground)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 输入 */}
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索模块、跳转、视频…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
        </div>

        {/* 结果 */}
        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">无匹配结果</div>
          )}

          {navRows.length > 0 && (
            <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">跳转</div>
          )}
          {navRows.map((row, i) => {
            const Icon = row.icon
            const active = i === highlight
            return (
              <button
                key={row.id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); activate(row) }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                  active ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]',
                )}
              >
                <Icon className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
                <span className="flex-1 truncate">{row.name}</span>
                {row.group && <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{row.group}</span>}
              </button>
            )
          })}

          {videoRows.length > 0 && (
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">视频</div>
          )}
          {videoRows.map((row, idx) => {
            const i = navCount + idx
            const active = i === highlight
            return (
              <button
                key={row.id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); activate(row) }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
                  active ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]',
                )}
              >
                <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-[var(--color-muted)]">
                  <VideoThumb scanId={row.item.scanId} path={row.item.path} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{row.item.name}</div>
                  <div className="truncate text-xs text-[var(--color-muted-foreground)]">{dirOf(row.item.path)}</div>
                </div>
                <Film className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
              </button>
            )
          })}
        </div>

        {/* 页脚提示 */}
        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
          <span className="inline-flex items-center gap-1"><CornerDownLeft className="size-3" />打开</span>
          <span>↑↓ 选择</span>
          <span>Esc 关闭</span>
          <span className="ml-auto">Ctrl / ⌘ + K</span>
        </div>
      </div>
    </div>
  )
}

function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i >= 0 ? p.slice(0, i) : p
}
