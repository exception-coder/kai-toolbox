import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getVideoLibrary } from '@/features/video-library/api'
import { useVideoLibraryConfig } from '@/features/video-library/components/ExcludedDirsSheet'
import { VideoThumb } from '@/features/video-library/components/VideoThumb'
import type { VideoLibraryItem } from '@/features/video-library/types'

const POPOVER_LIMIT = 10

/**
 * 全局视频搜索：装在 TopBar，从任何页面都能搜。命中后跳到视频库页并自动选中播放。
 *
 * 用 router state 传完整 item，省去后端再做一次「按 path 拿单视频」的接口；
 * VideoLibraryPage 里 useEffect 读 state.playItem 顶替默认选中。
 */
export function GlobalVideoSearch() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  // 移动端走全屏 modal:点击 TopBar 上那枚搜索图标按钮才显示。桌面端永远 false。
  const [mobileOpen, setMobileOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  // 300ms debounce 跟视频库页里的逻辑一致 (VideoLibraryPage.tsx:44-49)，避免按键就发请求。
  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === query) return
    const t = setTimeout(() => setQuery(trimmed), 300)
    return () => clearTimeout(t)
  }, [input, query])

  // 全局搜索与视频库列表共用排除目录配置,口径保持一致
  const { config: libraryConfig } = useVideoLibraryConfig()
  const excludedDirs = libraryConfig.excludedDirs

  const result = useQuery({
    queryKey: ['global-video-search', query, excludedDirs.join('\n')],
    // language 传空串 = 不限语言（全局搜索不做语言筛选）
    queryFn: () => getVideoLibrary('name', 'asc', 'all', query, false, '', excludedDirs, 0, POPOVER_LIMIT),
    enabled: query.length > 0,
    staleTime: 30_000,
  })

  const items = result.data?.items ?? []
  const total = result.data?.total ?? 0
  const tokens = useMemo(() => splitTokens(query), [query])

  // 输入变了就把高亮拉回顶部，避免上一轮的位置错位
  useEffect(() => {
    setHighlight(0)
  }, [query, items.length])

  // 点容器外面关掉桌面端弹层(移动端走 modal 不受影响)
  useEffect(() => {
    if (!focused) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [focused])

  // 移动端 modal 打开时自动 focus 输入框,并把 body 锁滚动避免背景串动
  useEffect(() => {
    if (!mobileOpen) return
    // 等 modal 节点挂上 DOM 后再 focus,免得 ref 还是 null
    const id = window.setTimeout(() => mobileInputRef.current?.focus(), 0)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(id)
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const showDesktopPopover = focused && query.length > 0

  function selectItem(item: VideoLibraryItem) {
    navigate('/tools/video-library', { state: { playItem: item } })
    setInput('')
    setQuery('')
    setFocused(false)
    setMobileOpen(false)
    inputRef.current?.blur()
    mobileInputRef.current?.blur()
  }

  function closeMobile() {
    setMobileOpen(false)
    setFocused(false)
    mobileInputRef.current?.blur()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setFocused(false)
      setMobileOpen(false)
      inputRef.current?.blur()
      mobileInputRef.current?.blur()
      return
    }
    // 桌面端和移动端共用方向键逻辑;两边的"是否可选"判定都是 query.length > 0 && items.length > 0
    if (query.length === 0 || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => (h + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => (h - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = items[highlight] ?? items[0]
      if (target) selectItem(target)
    }
  }

  return (
    <>
      {/* 移动端入口:一枚搜索按钮,点击拉起全屏 modal。TopBar 左中右三栏在小屏上空间紧
          (汉堡菜单 + Mock 按钮 + 主题切换),硬挤一个 input 会卡住,改用图标 + modal。 */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileOpen(true)}
        title="全局搜索视频"
      >
        <Search className="h-4 w-4" />
      </Button>

      {/* 桌面端内嵌搜索框 + popover(原逻辑)。放大占顶栏重心：填满中间区、最宽 560px。 */}
      <div ref={containerRef} className="relative hidden md:block w-full max-w-[560px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <input
          ref={inputRef}
          type="search"
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="全局搜索视频…  支持空格分词"
          className="h-9 w-full rounded-md border bg-[var(--color-background)] pl-8 pr-8 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput('')
              setQuery('')
              inputRef.current?.focus()
            }}
            title="清除"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {showDesktopPopover && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border bg-[var(--color-popover)] text-[var(--color-popover-foreground)] shadow-lg">
            {renderResults(/* mobile */ false)}
          </div>
        )}
      </div>

      {/* 移动端全屏 modal:占满 viewport,顶部 input,下方结果列表占满剩余高度滚动。
          z-50 高于 TopBar 自己的 z-stack,但低于全局 ConfirmDialog (那个用 z-[100])。 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-background)] md:hidden">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              ref={mobileInputRef}
              type="search"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="全局搜索视频…  支持空格分词"
              className="flex-1 bg-transparent text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput('')
                  setQuery('')
                  mobileInputRef.current?.focus()
                }}
                title="清除"
                className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={closeMobile} title="关闭">
              取消
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {query.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                输入关键字开始搜索
              </div>
            ) : (
              renderResults(/* mobile */ true)
            )}
          </div>
        </div>
      )}
    </>
  )

  // 复用桌面端 popover 和移动端 modal 的结果区域。差异:移动端 list item 大点便于触摸,
  // 桌面端紧凑;both 走同一份 selectItem 逻辑。
  function renderResults(mobile: boolean): ReactNode {
    if (result.isLoading) {
      return (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          搜索中…
        </div>
      )
    }
    if (items.length === 0) {
      return (
        <div className="px-3 py-3 text-sm text-[var(--color-muted-foreground)]">
          未找到匹配视频
        </div>
      )
    }
    return (
      <>
        {items.map((item, idx) => (
          <button
            key={item.path}
            type="button"
            onMouseEnter={() => setHighlight(idx)}
            // 桌面端用 mousedown 抢在 input blur 之前;移动端 onMouseDown 也兼容触摸事件,
            // 桌面用户继续走它,移动用户走 click 也行,这里统一保留 onMouseDown 一份代码。
            onMouseDown={e => {
              e.preventDefault()
              selectItem(item)
            }}
            className={cn(
              'flex w-full items-center gap-2.5 text-left',
              mobile ? 'border-b px-3 py-2.5' : 'px-2 py-1.5',
              idx === highlight ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]',
            )}
          >
            <div className={cn(
              'shrink-0 overflow-hidden rounded bg-[var(--color-muted)]',
              mobile ? 'h-12 w-20' : 'h-9 w-16',
            )}>
              <VideoThumb scanId={item.scanId} path={item.path} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn('truncate', mobile ? 'text-sm' : 'text-sm')}>
                {highlightTokens(item.name, tokens)}
              </div>
              <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                {highlightTokens(dirOf(item.path), tokens)}
              </div>
            </div>
          </button>
        ))}
        {total > items.length && (
          <div className="border-t px-3 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
            显示前 {items.length} 条，共 {total} 条匹配 — 打开视频库查看完整列表
          </div>
        )}
      </>
    )
  }
}

/** 按任意空白拆词、去空、去重。前端只用来高亮，命中判定仍由后端做。 */
function splitTokens(q: string): string[] {
  const trimmed = q.trim()
  if (!trimmed) return []
  return Array.from(new Set(trimmed.split(/\s+/).filter(Boolean)))
}

/**
 * 把命中 token 包到 <mark>。Token 先按长度倒排，长 token 优先匹配，避免短 token 抢占。
 * 正则元字符全部转义，防止用户输入的 ".*"、"(" 之类把正则编炸。
 */
function highlightTokens(text: string, tokens: string[]): ReactNode {
  if (tokens.length === 0) return text
  const sorted = [...tokens].sort((a, b) => b.length - a.length)
  // String.split 用带捕获组的正则会把匹配段插在分割结果里：偶数索引是非匹配段、奇数索引是匹配段。
  // 比手动用 pattern.test 安全 —— 后者带 g 标志会保留 lastIndex 状态，map 里多次调用会乱。
  const pattern = new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(pattern)
  if (parts.length === 1) return text
  return parts.map((p, i) =>
    i % 2 === 1
      ? <mark key={i} className="rounded bg-amber-400/30 px-0.5 text-inherit">{p}</mark>
      : <span key={i}>{p}</span>
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i >= 0 ? p.slice(0, i) : p
}
