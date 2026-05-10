import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { formatBytes } from '@/lib/utils'
import { deleteFile } from '@/features/treesize/api'
import { addVideoFavorite, cleanJunkVideos, getVideoLibrary, removeVideoFavorite } from '../api'
import { VideoListPanel } from '../components/VideoListPanel'
import { VideoPlayerPanel } from '../components/VideoPlayerPanel'
import { loadState, saveState } from '../storage'
import type { VideoLibraryItem, VideoLibraryPage, VideoSizeBucket, VideoSortBy, VideoSortOrder } from '../types'

const PAGE_SIZE = 200

export function VideoLibraryPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  // Read once on mount. Lazy initializers fire only on the first render, so the localStorage
  // round-trip happens exactly once even though three separate state slots reference it.
  const persisted = useMemo(() => loadState(), [])
  const [sortBy, setSortBy] = useState<VideoSortBy>(persisted.sortBy ?? 'name')
  const [order, setOrder] = useState<VideoSortOrder>(persisted.order ?? 'asc')
  const [sizeBucket, setSizeBucket] = useState<VideoSizeBucket>(persisted.sizeBucket ?? 'all')
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(persisted.favoritesOnly ?? false)
  // The input is what the user sees as they type; `searchQuery` is the debounced value the
  // backend actually sees. This prevents a network round-trip per keystroke.
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  // The currently-playing video lives as its own state instead of being derived from the
  // filtered `items` list. Otherwise typing in the search box (or any filter that empties the
  // list) would tear down the player. The path is what we persist; the full item lets the
  // player keep rendering even when filters exclude it from the visible list.
  const [currentItem, setCurrentItem] = useState<VideoLibraryItem | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const selectedPath = currentItem?.path ?? null

  // 300ms debounce. Trim the input first so a single trailing space doesn't refire.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === searchQuery) return
    const t = setTimeout(() => setSearchQuery(trimmed), 300)
    return () => clearTimeout(t)
  }, [searchInput, searchQuery])

  const queryKey = useMemo(
    () => ['video-library', sortBy, order, sizeBucket, searchQuery, favoritesOnly] as const,
    [sortBy, order, sizeBucket, searchQuery, favoritesOnly],
  )

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getVideoLibrary(sortBy, order, sizeBucket, searchQuery, favoritesOnly, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (_lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.items.length, 0)
      const total = allPages[0]?.total ?? 0
      return loaded < total ? loaded : undefined
    },
  })

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap(p => p.items),
    [query.data],
  )
  const total = query.data?.pages[0]?.total ?? 0

  // First-load auto-select. Prefer the path persisted from the previous session if it's
  // still in the (currently loaded) item list; otherwise fall back to the first item.
  // Consulted only when no item is currently playing — once the user has picked something,
  // their selection stays even if the filter clears the list.
  useEffect(() => {
    if (currentItem !== null || items.length === 0) return
    const target = persisted.selectedPath
      ? items.find(it => it.path === persisted.selectedPath)
      : null
    setCurrentItem(target ?? items[0])
  }, [items, currentItem, persisted.selectedPath])

  // Mirror sort + last-played to localStorage. Best-effort; failures are swallowed inside
  // saveState (private mode, quota exceeded). Search keyword is intentionally not persisted —
  // re-opening the page should start with a clean filter.
  useEffect(() => {
    saveState({ sortBy, order, sizeBucket, favoritesOnly, selectedPath })
  }, [sortBy, order, sizeBucket, favoritesOnly, selectedPath])

  // Keep the local currentItem in sync with the cached row when the user is still seeing it
  // in the filtered list. Picks up favorited-flag changes and any other field edits without
  // losing the player when the list goes empty (we only update if a fresh row exists).
  useEffect(() => {
    if (!currentItem) return
    const fresh = items.find(it => it.path === currentItem.path)
    if (fresh && fresh !== currentItem) setCurrentItem(fresh)
  }, [items, currentItem])

  const selectedIndex = currentItem ? items.findIndex(it => it.path === currentItem.path) : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex >= 0 && selectedIndex < items.length - 1

  const handleSelect = (item: VideoLibraryItem) => {
    setCurrentItem(item)
    setListOpen(false)
  }

  const handlePrev = () => {
    if (hasPrev) setCurrentItem(items[selectedIndex - 1])
  }

  const handleNext = () => {
    if (hasNext) setCurrentItem(items[selectedIndex + 1])
  }

  const handleSortChange = (s: VideoSortBy, o: VideoSortOrder) => {
    setSortBy(s)
    setOrder(o)
  }

  /**
   * Optimistic favorite toggle. We mutate every cached infinite page (regardless of
   * filter combination) so that switching filters afterwards still reflects the new state
   * without a refetch. The "favoritesOnly" view also gets the row pruned/inserted so the
   * count stays honest.
   */
  const handleToggleFavorite = async (item: VideoLibraryItem) => {
    const next = !item.favorited
    // Mirror the change into the standalone player state. Necessary when the playing item is
    // filtered out of the list (e.g. search active) — the items→currentItem sync effect above
    // wouldn't fire because there's no fresh row to copy from.
    setCurrentItem(prev => (prev && prev.path === item.path ? { ...prev, favorited: next } : prev))
    qc.getQueriesData<InfiniteData<VideoLibraryPage>>({ queryKey: ['video-library'] })
      .forEach(([key, data]) => {
        if (!data) return
        // Was the cached query for "favoritesOnly"? If so, an unfavorite drops the row;
        // a favorite would add a row out of the original sort order, so refetch via invalidate.
        const wasFavoritesOnly = Array.isArray(key) && key[5] === true
        if (wasFavoritesOnly && next) {
          qc.invalidateQueries({ queryKey: key })
          return
        }
        const pages = data.pages.map(p => {
          if (wasFavoritesOnly && !next) {
            const filtered = p.items.filter(it => it.path !== item.path)
            const removed = p.items.length - filtered.length
            return { ...p, items: filtered, total: p.total - removed }
          }
          return {
            ...p,
            items: p.items.map(it => (it.path === item.path ? { ...it, favorited: next } : it)),
          }
        })
        qc.setQueryData<InfiniteData<VideoLibraryPage>>(key, { ...data, pages })
      })
    try {
      if (next) await addVideoFavorite(item.path)
      else await removeVideoFavorite(item.path)
    } catch (e) {
      // Rollback: revert the player snapshot, then refetch every cached video-library query
      // so list/queue state matches the server.
      setCurrentItem(prev => (prev && prev.path === item.path ? { ...prev, favorited: !next } : prev))
      qc.invalidateQueries({ queryKey: ['video-library'] })
      const msg = e instanceof ApiError ? e.message : String(e)
      await confirm({ title: '收藏失败', description: msg, confirmText: '知道了', cancelText: '关闭' })
    }
  }

  /** Optimistically remove a deleted item from every cached page so we don't re-fetch. */
  const removeFromCache = (path: string) => {
    qc.setQueryData<InfiniteData<VideoLibraryPage>>(queryKey, data => {
      if (!data) return data
      let removed = 0
      const pages = data.pages.map(p => {
        const filtered = p.items.filter(it => {
          if (it.path === path) {
            removed++
            return false
          }
          return true
        })
        return { ...p, items: filtered, total: p.total - removed }
      })
      return { ...data, pages }
    })
  }

  const handleDelete = async (item: VideoLibraryItem) => {
    const ok = await confirm({
      title: '确认删除文件',
      description: (
        <div className="space-y-1">
          <div className="break-all text-sm font-medium">{item.name}</div>
          <div className="text-xs tabular-nums text-[var(--color-muted-foreground)]">{formatBytes(item.size)}</div>
          {/* Full path so the user can verify on the host before clicking 删除. */}
          <div className="break-all font-mono text-[11px] text-[var(--color-muted-foreground)]">{item.path}</div>
          <div className="pt-2">将移到回收站；如系统不支持回收站则永久删除。</div>
        </div>
      ),
      confirmText: '删除',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      // If the user is deleting what they're currently watching, swap to the neighbour FIRST.
      // React's key-based unmount tears down VideoPlayer → hls.js destroy + video.pause() +
      // src removal, which closes the GET to the backend and lets ffmpeg / Range readers
      // reap. Without this, Windows holds the file open and moveToTrash fails with a sharing
      // violation. The 400 ms wait is a generous bound on that teardown — HLS process reap
      // grace is 2000 ms but typically completes in tens of ms; native streams close as soon
      // as the writer flushes.
      if (item.path === selectedPath) {
        const nextItem = items[selectedIndex + 1] ?? items[selectedIndex - 1] ?? null
        setCurrentItem(nextItem)
        await new Promise(resolve => setTimeout(resolve, 400))
      }
      const result = await deleteFile(item.scanId, item.path)
      removeFromCache(item.path)
      if (!result.toTrash) {
        // Trash unavailable → file is gone for good. Tell the user explicitly so they don't
        // assume they can recover from the recycle bin.
        await confirm({
          title: '已永久删除',
          description: (
            <div className="space-y-1">
              <div>系统未能将文件移到回收站，已直接永久删除。</div>
              <div className="break-all font-mono text-[11px] text-[var(--color-muted-foreground)]">{item.path}</div>
              <div className="text-xs text-[var(--color-muted-foreground)]">详细原因可在后端日志中查看（WARN 级别）。</div>
            </div>
          ),
          confirmText: '知道了',
          cancelText: '关闭',
        })
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e)
      await confirm({ title: '删除失败', description: msg, confirmText: '知道了', cancelText: '关闭' })
    }
  }

  const handleBulkDelete = async (toDelete: VideoLibraryItem[]) => {
    if (toDelete.length === 0) return
    const totalSize = toDelete.reduce((acc, x) => acc + x.size, 0)
    const includesPlaying = toDelete.some(x => x.path === selectedPath)
    // Cap visible path list so a 200-item delete doesn't blow up the dialog. The summary
    // line above always carries the full count.
    const previewPaths = toDelete.slice(0, 30)
    const overflowCount = toDelete.length - previewPaths.length

    const ok = await confirm({
      title: `批量删除 ${toDelete.length} 个文件`,
      description: (
        <div className="space-y-2">
          <div>
            共 <span className="font-medium">{formatBytes(totalSize)}</span>，将逐个移到回收站；
            如系统不支持回收站则永久删除。
          </div>
          {includesPlaying && (
            <div className="text-xs text-[var(--color-destructive)]">
              包含正在播放的视频，删除前会自动切到下一首。
            </div>
          )}
          <ul className="max-h-40 space-y-0.5 overflow-y-auto break-all rounded border bg-[var(--color-muted)]/30 p-2 font-mono text-[11px] text-[var(--color-muted-foreground)]">
            {previewPaths.map(x => <li key={x.path}>{x.path}</li>)}
            {overflowCount > 0 && <li>… 还有 {overflowCount} 个未列出</li>}
          </ul>
        </div>
      ),
      confirmText: '全部删除',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (!ok) return

    // If the playing item is in the batch, swap selection BEFORE deleting so VideoPlayer
    // tears down the stream and Windows releases the file lock. The 400 ms wait matches
    // the single-delete handler.
    if (includesPlaying) {
      const toDeletePaths = new Set(toDelete.map(x => x.path))
      const survivor = items.find(x => !toDeletePaths.has(x.path)) ?? null
      setCurrentItem(survivor)
      await new Promise(resolve => setTimeout(resolve, 400))
    }

    let permaCount = 0
    const errors: { path: string; msg: string }[] = []
    for (const it of toDelete) {
      try {
        const result = await deleteFile(it.scanId, it.path)
        removeFromCache(it.path)
        if (!result.toTrash) permaCount++
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : String(e)
        errors.push({ path: it.path, msg })
      }
    }

    const successCount = toDelete.length - errors.length
    await confirm({
      title: '批量删除完成',
      description: (
        <div className="space-y-2 text-sm">
          <div>
            成功 <span className="font-medium tabular-nums">{successCount}</span>
            {permaCount > 0 && (
              <span className="text-[var(--color-muted-foreground)]">
                （其中 {permaCount} 个为永久删除）
              </span>
            )}
            {errors.length > 0 && (
              <>
                ，失败 <span className="font-medium tabular-nums text-[var(--color-destructive)]">{errors.length}</span>
              </>
            )}
          </div>
          {errors.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto break-all rounded border bg-[var(--color-muted)]/30 p-2 font-mono text-[11px] text-[var(--color-destructive)]">
              {errors.map(e => <li key={e.path}>{e.path}：{e.msg}</li>)}
            </ul>
          )}
          {permaCount > 0 && (
            <div className="text-xs text-[var(--color-muted-foreground)]">
              永久删除的详细原因可在后端日志中查看（WARN 级别）。
            </div>
          )}
        </div>
      ),
      confirmText: '知道了',
      cancelText: '关闭',
    })
  }

  const cleanJunkMutation = useMutation({
    mutationFn: cleanJunkVideos,
    onSuccess: () => {
      // Server state changed underneath us; safest to drop the whole infinite cache and
      // refetch from page 0. The user just performed a bulk action and expects a fresh list.
      qc.invalidateQueries({ queryKey: ['video-library'] })
    },
  })

  const handleCleanJunk = async () => {
    const ok = await confirm({
      title: '清理 ._ 缓存文件',
      description: (
        <div className="space-y-2">
          <div>将扫描所有以 <code className="rounded bg-[var(--color-muted)] px-1 font-mono">._</code> 开头、且当前大小小于 10 KB 的视频文件，移到回收站。</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            通常是 macOS 拷贝时残留的元数据缓存。安全阈值 10 KB 防止误删真实视频。
          </div>
        </div>
      ),
      confirmText: '清理',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      const result = await cleanJunkMutation.mutateAsync()
      const errLines = result.errors.slice(0, 3).join('\n')
      await confirm({
        title: '清理完成',
        description: (
          <div className="space-y-1">
            <div>已删除 <strong>{result.deleted}</strong> 个；跳过 {result.skipped} 个。</div>
            {result.errors.length > 0 && (
              <div className="text-xs text-[var(--color-destructive)]">
                {result.errors.length} 个失败：
                <pre className="mt-1 whitespace-pre-wrap break-all">{errLines}</pre>
              </div>
            )}
          </div>
        ),
        confirmText: '知道了',
        cancelText: '关闭',
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e)
      await confirm({ title: '清理失败', description: msg, confirmText: '知道了', cancelText: '关闭' })
    }
  }

  const fetchNextPage = () => {
    if (!query.isFetchingNextPage && query.hasNextPage) query.fetchNextPage()
  }

  const sharedListProps = {
    items,
    total,
    selectedPath,
    sortBy,
    order,
    sizeBucket,
    searchInput,
    favoritesOnly,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    onSelect: handleSelect,
    onSortChange: handleSortChange,
    onSizeBucketChange: setSizeBucket,
    onSearchInputChange: setSearchInput,
    onFavoritesOnlyChange: setFavoritesOnly,
    onToggleFavorite: handleToggleFavorite,
    onLoadMore: fetchNextPage,
    onDelete: handleDelete,
    onBulkDelete: handleBulkDelete,
    onCleanJunk: handleCleanJunk,
    cleaningJunk: cleanJunkMutation.isPending,
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 md:gap-4 md:px-6 md:py-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">视频库</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          已扫描磁盘里的所有视频。点击选中即可在线播放，支持上下首切换；列表可按名称或大小排序、分页加载。
        </p>
      </header>

      {query.isLoading ? (
        <div className="flex h-72 items-center justify-center rounded-md border text-sm text-[var(--color-muted-foreground)]">
          加载中…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[320px_1fr] md:gap-4">
          <aside className="hidden h-[calc(100vh-12rem)] overflow-hidden rounded-md border bg-[var(--color-card)] md:flex md:flex-col">
            <VideoListPanel {...sharedListProps} />
          </aside>

          <main className="min-w-0 md:h-[calc(100vh-12rem)] md:overflow-hidden">
            <VideoPlayerPanel
              item={currentItem}
              items={items}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={handlePrev}
              onNext={handleNext}
              onSelect={handleSelect}
              onOpenList={() => setListOpen(true)}
              onDelete={handleDelete}
              onBulkDelete={handleBulkDelete}
              onToggleFavorite={handleToggleFavorite}
            />
          </main>
        </div>
      )}

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="bottom" className="flex h-[80vh] flex-col p-0">
          <SheetTitle className="sr-only">视频列表</SheetTitle>
          <SheetDescription className="sr-only">选择要播放的视频</SheetDescription>
          <VideoListPanel {...sharedListProps} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
