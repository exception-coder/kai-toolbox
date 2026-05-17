import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckSquare, Loader2, Search, Sparkles, Square, Star, Trash2, X } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { VideoThumb } from './VideoThumb'
import type { VideoLibraryItem, VideoSizeBucket, VideoSortBy, VideoSortOrder } from '../types'
import { VIDEO_SIZE_BUCKETS } from '../types'

interface Props {
  items: VideoLibraryItem[]
  total: number
  selectedPath: string | null
  sortBy: VideoSortBy
  order: VideoSortOrder
  sizeBucket: VideoSizeBucket
  /** Raw query box value; controlled by the page (which debounces it before requesting). */
  searchInput: string
  favoritesOnly: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onSelect: (item: VideoLibraryItem) => void
  onSortChange: (sortBy: VideoSortBy, order: VideoSortOrder) => void
  onSizeBucketChange: (bucket: VideoSizeBucket) => void
  onSearchInputChange: (value: string) => void
  onFavoritesOnlyChange: (value: boolean) => void
  onToggleFavorite: (item: VideoLibraryItem) => void
  onLoadMore: () => void
  onDelete?: (item: VideoLibraryItem) => void
  /** When provided, the list shows a 多选 toggle and lets the user delete in bulk. */
  onBulkDelete?: (items: VideoLibraryItem[]) => void | Promise<void>
  onCleanJunk?: () => void
  cleaningJunk?: boolean
}

const SORT_OPTIONS: { value: `${VideoSortBy}:${VideoSortOrder}`; label: string }[] = [
  { value: 'name:asc', label: '名称 A→Z' },
  { value: 'name:desc', label: '名称 Z→A' },
  { value: 'size:desc', label: '大小 大→小' },
  { value: 'size:asc', label: '大小 小→大' },
]

/**
 * Presentational list. Scroll-near-bottom triggers {@code onLoadMore} via an
 * {@link IntersectionObserver} scoped to the list's own scroll container, so it works
 * inside both the desktop sidebar and the mobile bottom-sheet drawer.
 */
export function VideoListPanel({
  items,
  total,
  selectedPath,
  sortBy,
  order,
  sizeBucket,
  searchInput,
  favoritesOnly,
  hasNextPage,
  isFetchingNextPage,
  onSelect,
  onSortChange,
  onSizeBucketChange,
  onSearchInputChange,
  onFavoritesOnlyChange,
  onToggleFavorite,
  onLoadMore,
  onDelete,
  onBulkDelete,
  onCleanJunk,
  cleaningJunk,
}: Props) {
  const sortValue = `${sortBy}:${order}` as const
  const listRef = useRef<HTMLUListElement>(null)
  const sentinelRef = useRef<HTMLLIElement>(null)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [bulkPending, setBulkPending] = useState(false)

  // Drop selection entries that no longer correspond to a loaded item (e.g. after a delete
  // pass removed them from the cache). Without this the count would lie and "全选" toggle
  // would consider phantom rows.
  useEffect(() => {
    setSelectedPaths(prev => {
      if (prev.size === 0) return prev
      const live = new Set(items.map(it => it.path))
      let changed = false
      const next = new Set<string>()
      for (const p of prev) {
        if (live.has(p)) next.add(p)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [items])

  const toggleSelected = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const allSelected = items.length > 0 && items.every(it => selectedPaths.has(it.path))
  const toggleAll = () => {
    setSelectedPaths(prev => {
      if (allSelected) return new Set()
      const next = new Set(prev)
      for (const it of items) next.add(it.path)
      return next
    })
  }

  const exitMultiSelect = () => {
    setMultiSelectMode(false)
    setSelectedPaths(new Set())
  }

  const selectedItems = useMemo(
    () => items.filter(it => selectedPaths.has(it.path)),
    [items, selectedPaths],
  )

  const handleBulkDelete = async () => {
    if (!onBulkDelete || selectedItems.length === 0 || bulkPending) return
    setBulkPending(true)
    try {
      await onBulkDelete(selectedItems)
      // The page may have removed deleted items from the cache; surviving paths are still
      // in `items`, so the useEffect above will prune them. Just exit the mode.
      exitMultiSelect()
    } finally {
      setBulkPending(false)
    }
  }

  useEffect(() => {
    const list = listRef.current
    const sentinel = sentinelRef.current
    if (!list || !sentinel || !hasNextPage) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          onLoadMore()
        }
      },
      { root: list, rootMargin: '200px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, onLoadMore, items.length])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {multiSelectMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[var(--color-accent)]/40 px-3 py-2">
          <div className="text-sm font-semibold">
            已选{' '}
            <span className="tabular-nums">{selectedPaths.size}</span>
            {' / '}
            <span className="tabular-nums">{items.length}</span>
            <span className="ml-1 text-xs font-normal text-[var(--color-muted-foreground)]">
              （仅当前已加载）
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              disabled={items.length === 0 || bulkPending}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
            >
              {allSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
              {allSelected ? '取消全选' : '全选'}
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={selectedPaths.size === 0 || bulkPending}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-2 py-1.5 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/20 disabled:opacity-50"
            >
              {bulkPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              删除 {selectedPaths.size > 0 && `(${selectedPaths.size})`}
            </button>
            <button
              type="button"
              onClick={exitMultiSelect}
              disabled={bulkPending}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              退出
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <input
                type="search"
                value={searchInput}
                onChange={e => onSearchInputChange(e.target.value)}
                placeholder="搜索文件名…"
                className="w-full rounded-md border bg-[var(--color-background)] py-1.5 pl-7 pr-7 text-xs placeholder:text-[var(--color-muted-foreground)]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => onSearchInputChange('')}
                  title="清除"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
              title={favoritesOnly ? '显示全部视频' : '只看收藏'}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs',
                favoritesOnly
                  ? 'border-amber-400/60 bg-amber-400/15 text-amber-600 dark:text-amber-300'
                  : 'hover:bg-[var(--color-accent)]',
              )}
            >
              <Star className={cn('h-3.5 w-3.5', favoritesOnly && 'fill-current')} />
              仅收藏
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-sm font-semibold">
              视频{' '}
              <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                ({items.length}/{total})
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onBulkDelete && (
                <button
                  type="button"
                  onClick={() => setMultiSelectMode(true)}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)]"
                  title="进入多选模式，批量删除"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  多选
                </button>
              )}
              {onCleanJunk && (
                <button
                  type="button"
                  onClick={onCleanJunk}
                  disabled={cleaningJunk}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
                  title="批量删除 ._xxx 缓存文件（< 10 KB）"
                >
                  {cleaningJunk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  清理 ._ 文件
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={sizeBucket}
              onChange={e => onSizeBucketChange(e.target.value as VideoSizeBucket)}
              className="w-full min-w-0 rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs"
              title="按文件大小过滤"
            >
              {VIDEO_SIZE_BUCKETS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={sortValue}
              onChange={e => {
                const [s, o] = e.target.value.split(':') as [VideoSortBy, VideoSortOrder]
                onSortChange(s, o)
              }}
              className="w-full min-w-0 rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {items.length === 0 && !hasNextPage ? (
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-[var(--color-muted-foreground)]">
          {sizeBucket === 'all' && !searchInput.trim() && !favoritesOnly
            ? '没有视频。请先在「磁盘空间分析」里扫描一个含视频的目录。'
            : '当前过滤条件下没有匹配的视频。试试清空搜索、关闭「仅收藏」或选「全部大小」。'}
        </div>
      ) : (
        <ul ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
          {items.map(item => {
            const isActive = item.path === selectedPath
            const isChecked = selectedPaths.has(item.path)
            return (
              <li key={item.path} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (multiSelectMode) toggleSelected(item.path)
                    else onSelect(item)
                  }}
                  className={cn(
                    'group flex w-full items-center gap-3 border-l-2 py-2 text-left text-sm transition-colors',
                    'min-w-0',
                    multiSelectMode ? 'pl-2 pr-3' : onDelete ? 'pl-3 pr-16' : 'pl-3 pr-10',
                    multiSelectMode && isChecked
                      ? 'border-l-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : isActive
                        ? 'border-l-[var(--color-primary)] bg-[var(--color-accent)] font-medium'
                        : 'border-l-transparent hover:bg-[var(--color-accent)]/60',
                  )}
                  title={item.path}
                >
                  {multiSelectMode && (
                    <div className="shrink-0 text-[var(--color-primary)]">
                      {isChecked ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                      )}
                    </div>
                  )}
                  <div className="aspect-video w-20 shrink-0 overflow-hidden rounded bg-black">
                    <VideoThumb scanId={item.scanId} path={item.path} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item.name}</div>
                    <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {formatBytes(item.size)} · <span className="font-mono">{item.rootPath}</span>
                    </div>
                  </div>
                </button>
                {!multiSelectMode && (
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        onToggleFavorite(item)
                      }}
                      title={item.favorited ? '取消收藏' : '收藏'}
                      className={cn(
                        'rounded p-1.5 transition-colors',
                        item.favorited
                          ? 'text-amber-500 hover:bg-amber-400/10 dark:text-amber-300'
                          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-amber-500',
                      )}
                    >
                      <Star className={cn('h-3.5 w-3.5', item.favorited && 'fill-current')} />
                    </button>
                    {onDelete && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          onDelete(item)
                        }}
                        title="删除（移到回收站）"
                        className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}

          {/* Sentinel — IntersectionObserver fires onLoadMore when this enters the scrollport. */}
          {hasNextPage && (
            <li
              ref={sentinelRef}
              className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-[var(--color-muted-foreground)]"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载中…
                </>
              ) : (
                <span>滚动以加载更多</span>
              )}
            </li>
          )}
          {!hasNextPage && items.length > 0 && (
            <li className="px-3 py-3 text-center text-xs text-[var(--color-muted-foreground)]">
              已全部加载（{items.length} 项）
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
