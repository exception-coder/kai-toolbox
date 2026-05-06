import { useEffect, useRef } from 'react'
import { Loader2, Sparkles, Trash2 } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { VideoThumb } from './VideoThumb'
import type { VideoLibraryItem, VideoSortBy, VideoSortOrder } from '../types'

interface Props {
  items: VideoLibraryItem[]
  total: number
  selectedPath: string | null
  sortBy: VideoSortBy
  order: VideoSortOrder
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onSelect: (item: VideoLibraryItem) => void
  onSortChange: (sortBy: VideoSortBy, order: VideoSortOrder) => void
  onLoadMore: () => void
  onDelete?: (item: VideoLibraryItem) => void
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
  hasNextPage,
  isFetchingNextPage,
  onSelect,
  onSortChange,
  onLoadMore,
  onDelete,
  onCleanJunk,
  cleaningJunk,
}: Props) {
  const sortValue = `${sortBy}:${order}` as const
  const listRef = useRef<HTMLUListElement>(null)
  const sentinelRef = useRef<HTMLLIElement>(null)

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-sm font-semibold">
          视频{' '}
          <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
            ({items.length}/{total})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onCleanJunk && (
            <button
              type="button"
              onClick={onCleanJunk}
              disabled={cleaningJunk}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
              title="批量删除 ._xxx 缓存文件（< 10 KB）"
            >
              {cleaningJunk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              清理 ._ 文件
            </button>
          )}
          <select
            value={sortValue}
            onChange={e => {
              const [s, o] = e.target.value.split(':') as [VideoSortBy, VideoSortOrder]
              onSortChange(s, o)
            }}
            className="rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {items.length === 0 && !hasNextPage ? (
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-[var(--color-muted-foreground)]">
          没有视频。请先在「磁盘空间分析」里扫描一个含视频的目录。
        </div>
      ) : (
        <ul ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
          {items.map(item => {
            const isActive = item.path === selectedPath
            return (
              <li key={item.path} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={cn(
                    'group flex w-full items-center gap-3 border-l-2 py-2 text-left text-sm transition-colors',
                    'min-w-0',
                    onDelete ? 'pl-3 pr-10' : 'px-3',
                    isActive
                      ? 'border-l-[var(--color-primary)] bg-[var(--color-accent)] font-medium'
                      : 'border-l-transparent hover:bg-[var(--color-accent)]/60',
                  )}
                  title={item.path}
                >
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
                {onDelete && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onDelete(item)
                    }}
                    title="删除（移到回收站）"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
