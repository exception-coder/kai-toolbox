import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { formatBytes } from '@/lib/utils'
import { deleteFile } from '@/features/treesize/api'
import { cleanJunkVideos, getVideoLibrary } from '../api'
import { VideoListPanel } from '../components/VideoListPanel'
import { VideoPlayerPanel } from '../components/VideoPlayerPanel'
import { loadState, saveState } from '../storage'
import type { VideoLibraryItem, VideoLibraryPage, VideoSortBy, VideoSortOrder } from '../types'

const PAGE_SIZE = 200

export function VideoLibraryPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  // Read once on mount. Lazy initializers fire only on the first render, so the localStorage
  // round-trip happens exactly once even though three separate state slots reference it.
  const persisted = useMemo(() => loadState(), [])
  const [sortBy, setSortBy] = useState<VideoSortBy>(persisted.sortBy ?? 'name')
  const [order, setOrder] = useState<VideoSortOrder>(persisted.order ?? 'asc')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)

  const queryKey = useMemo(() => ['video-library', sortBy, order] as const, [sortBy, order])

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getVideoLibrary(sortBy, order, pageParam, PAGE_SIZE),
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
  // still in the (currently loaded) item list; otherwise fall back to the first item. The
  // persisted path is consulted only on the very first render — once `selectedPath` is set,
  // user clicks take over.
  useEffect(() => {
    if (selectedPath !== null || items.length === 0) return
    const target = persisted.selectedPath
      ? items.find(it => it.path === persisted.selectedPath)
      : null
    setSelectedPath(target ? target.path : items[0].path)
  }, [items, selectedPath, persisted.selectedPath])

  // Mirror sort + last-played to localStorage. Best-effort; failures are swallowed inside
  // saveState (private mode, quota exceeded).
  useEffect(() => {
    saveState({ sortBy, order, selectedPath })
  }, [sortBy, order, selectedPath])

  const selectedIndex = selectedPath ? items.findIndex(it => it.path === selectedPath) : -1
  const currentItem = selectedIndex >= 0 ? items[selectedIndex] : null
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex >= 0 && selectedIndex < items.length - 1

  const handleSelect = (item: VideoLibraryItem) => {
    setSelectedPath(item.path)
    setListOpen(false)
  }

  const handlePrev = () => {
    if (hasPrev) setSelectedPath(items[selectedIndex - 1].path)
  }

  const handleNext = () => {
    if (hasNext) setSelectedPath(items[selectedIndex + 1].path)
  }

  const handleSortChange = (s: VideoSortBy, o: VideoSortOrder) => {
    setSortBy(s)
    setOrder(o)
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
        setSelectedPath(nextItem?.path ?? null)
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
      setSelectedPath(survivor?.path ?? null)
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
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    onSelect: handleSelect,
    onSortChange: handleSortChange,
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
