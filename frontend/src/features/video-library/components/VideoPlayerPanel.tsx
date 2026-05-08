import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckSquare, ChevronLeft, ChevronRight, ListMusic, Loader2, Maximize, Minimize, Square, Trash2, X } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { VideoPlayer } from '@/features/video-playback/VideoPlayer'
import { subtitleTranslatedVttUrl, subtitleVttUrl } from '../api'
import { SubtitleControls, type SubtitleDisplayMode } from './SubtitleControls'
import { VideoThumb } from './VideoThumb'
import type { SubtitleJob, VideoLibraryItem } from '../types'

interface Props {
  item: VideoLibraryItem | null
  items: VideoLibraryItem[]
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onSelect: (item: VideoLibraryItem) => void
  /** Mobile-only — opens the bottom-sheet list. Hidden on desktop where the list is always visible. */
  onOpenList: () => void
  /** Optional per-card delete handler. When provided, the mobile grid shows a trash icon overlay. */
  onDelete?: (item: VideoLibraryItem) => void
  /** When provided, the mobile 队列 grid shows a 多选 toggle that opens a checkbox grid. */
  onBulkDelete?: (items: VideoLibraryItem[]) => void | Promise<void>
}

/** How many neighbours each side of the current item the horizontal queue strip renders. */
const QUEUE_WINDOW = 50

/** Pixels that match Tailwind `gap-2` between preview cards. */
const PREVIEW_GAP = 8
/** Approximate height of a preview card's text section (p-2 + 2 lines text-xs + size text-[10px]). */
const PREVIEW_TEXT_HEIGHT = 66
/** Tailwind `lg` breakpoint — switch from 3 to 4 columns at this width. */
const PREVIEW_LG_BREAKPOINT = 1024

/**
 * The right-hand (or top, on mobile) playback area: the headless {@code VideoPlayer} plus a
 * touch-friendly transport bar. The {@code key={item.path}} on {@code VideoPlayer} is what
 * makes prev/next correctly tear down the previous ffmpeg process before starting the next.
 */
export function VideoPlayerPanel({ item, items, hasPrev, hasNext, onPrev, onNext, onSelect, onOpenList, onDelete, onBulkDelete }: Props) {
  const activeStripRef = useRef<HTMLButtonElement | null>(null)
  const playerWrapperRef = useRef<HTMLDivElement | null>(null)
  const fsActiveRef = useRef<HTMLButtonElement | null>(null)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Drawer is per-fullscreen-session: closes automatically on exit so re-entering starts clean.
  const [fsListOpen, setFsListOpen] = useState(false)
  const [subtitleJob, setSubtitleJob] = useState<SubtitleJob | null>(null)
  // Multi-select for the 队列 grid below the player. Independent from the sidebar list's
  // multi-select so each viewport keeps its own selection.
  const [queueMultiSelect, setQueueMultiSelect] = useState(false)
  const [queueSelected, setQueueSelected] = useState<Set<string>>(() => new Set())
  const [queueBulkPending, setQueueBulkPending] = useState(false)
  // Persist the user's preferred display mode across video switches — most viewers will pick
  // "dual" once and want it to stick. Re-applied on every track that completes.
  const [subtitleMode, setSubtitleMode] = useState<SubtitleDisplayMode>('dual')

  // The current video changed — drop any subtitle state immediately so the player doesn't
  // briefly render the previous file's <track>. {@link SubtitleControls} will refetch.
  useEffect(() => {
    setSubtitleJob(null)
  }, [item?.path])

  const handleSubtitleJobChange = useCallback((j: SubtitleJob | null) => {
    setSubtitleJob(j)
  }, [])

  const subtitleUrl = subtitleJob?.status === 'COMPLETED' && subtitleJob.hasVtt
    ? subtitleVttUrl(subtitleJob.id)
    : undefined
  const subtitleTranslatedUrl = subtitleJob?.status === 'COMPLETED' && subtitleJob.hasTranslatedVtt
    ? subtitleTranslatedVttUrl(subtitleJob.id)
    : undefined
  const subtitleLanguage = subtitleJob?.sourceLanguage ?? undefined

  // Callback ref + ResizeObserver. We need a callback ref (not useRef + useEffect) because
  // the preview div is conditionally rendered: on first mount `item` is null and we early-return
  // a placeholder, so a useEffect with `[]` would run with `current = null` and never re-attach
  // when the real div appears. The callback fires whenever the div mounts/unmounts.
  const previewRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) {
      setPreviewSize({ width: 0, height: 0 })
      return
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setPreviewSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Desktop keyboard shortcuts. Mobile users won't have a physical keyboard;
  // ignored taps don't matter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasPrev, hasNext, onPrev, onNext])

  // Strip: keep the active card centered horizontally. `block: 'nearest'` avoids any vertical
  // page scroll, so clicking 下一首 keeps the user on the player instead of jumping to the grid.
  useEffect(() => {
    activeStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [item?.path])

  // Track fullscreen on the wrapper. We promote the wrapper (not the <video>) so the prev/next
  // and playlist overlays stay in the DOM tree above the video. Native fullscreen button is
  // disabled inside VideoPlayer; the user uses the custom Maximize/Minimize button instead.
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === playerWrapperRef.current
      setIsFullscreen(fs)
      if (!fs) setFsListOpen(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // When the playlist drawer opens in fullscreen, scroll the active row into view.
  useEffect(() => {
    if (fsListOpen) fsActiveRef.current?.scrollIntoView({ block: 'center' })
  }, [fsListOpen, item?.path])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void playerWrapperRef.current?.requestFullscreen()
    }
  }, [])

  // Prune queue selection entries that no longer exist (e.g. after a successful delete pass
  // shrinks the cache). Otherwise the count would lie and 全选 would consider phantom rows.
  useEffect(() => {
    setQueueSelected(prev => {
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

  const toggleQueueSelected = (path: string) => {
    setQueueSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const exitQueueMultiSelect = () => {
    setQueueMultiSelect(false)
    setQueueSelected(new Set())
  }

  const handleQueueBulkDelete = async (sourceItems: VideoLibraryItem[]) => {
    if (!onBulkDelete || queueSelected.size === 0 || queueBulkPending) return
    const targets = sourceItems.filter(it => queueSelected.has(it.path))
    if (targets.length === 0) return
    setQueueBulkPending(true)
    try {
      await onBulkDelete(targets)
      exitQueueMultiSelect()
    } finally {
      setQueueBulkPending(false)
    }
  }

  if (!item) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-md border bg-[var(--color-card)] text-sm text-[var(--color-muted-foreground)]">
        从右侧/底部列表选一个视频开始播放
      </div>
    )
  }

  // Slice a window around the current item so the strip never has to render thousands of buttons.
  const currentIndex = items.findIndex(it => it.path === item.path)
  const windowStart = currentIndex >= 0 ? Math.max(0, currentIndex - QUEUE_WINDOW) : 0
  const windowEnd = currentIndex >= 0 ? Math.min(items.length, currentIndex + QUEUE_WINDOW + 1) : items.length
  const queueWindow = items.slice(windowStart, windowEnd)
  const showStrip = items.length > 1

  // Desktop preview: fit as many cards as the space below the transport allows.
  // Card width comes from container width / column count; card height = aspect-video image + text section.
  const previewCols = previewSize.width >= PREVIEW_LG_BREAKPOINT ? 4 : 3
  const previewCardWidth = previewSize.width > 0
    ? (previewSize.width - PREVIEW_GAP * (previewCols - 1)) / previewCols
    : 0
  const previewCardHeight = previewCardWidth > 0
    ? (previewCardWidth * 9) / 16 + PREVIEW_TEXT_HEIGHT
    : 0
  const previewRows = previewCardHeight > 0 && previewSize.height > 0
    ? Math.max(1, Math.floor((previewSize.height + PREVIEW_GAP) / (previewCardHeight + PREVIEW_GAP)))
    : 0
  const previewCapacity = previewCols * previewRows
  // Center the window on the current item, but clamp at both ends so we don't waste slots.
  const previewWindow: VideoLibraryItem[] = (() => {
    if (previewCapacity === 0 || currentIndex < 0) return []
    const half = Math.floor(previewCapacity / 2)
    const desiredEnd = Math.min(items.length, Math.max(0, currentIndex - half) + previewCapacity)
    const start = Math.max(0, desiredEnd - previewCapacity)
    return items.slice(start, desiredEnd)
  })()

  return (
    <div className="flex flex-col gap-3 md:h-full">
      <div
        ref={playerWrapperRef}
        className={cn(
          'relative overflow-hidden rounded-md bg-black',
          // In fullscreen the wrapper fills the screen; rounded corners would clip the video
          // and the drawer would slide off-screen. Switch to a flex column so the bottom
          // control bar (PotPlayer-style) sits beneath the video without overlapping it.
          isFullscreen && 'flex h-full flex-col rounded-none',
        )}
      >
        <VideoPlayer
          key={item.path}
          scanId={item.scanId}
          path={item.path}
          subtitleUrl={subtitleUrl}
          subtitleTranslatedUrl={subtitleTranslatedUrl}
          subtitleLanguage={subtitleLanguage}
          subtitleMode={subtitleMode}
          // aspect-auto cancels the default aspect-video so the video can stretch to fill the
          // remaining flex space; min-h-0 lets flex shrink the box below content height.
          className={cn(isFullscreen && 'aspect-auto min-h-0 flex-1')}
        />

        {!isFullscreen && (
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                title="删除当前视频（移到回收站）"
                className="rounded-full bg-black/55 p-2 text-white/90 backdrop-blur-sm transition-colors hover:bg-[var(--color-destructive)] hover:text-white"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              title="全屏"
              className="rounded-full bg-black/55 p-2 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        )}

        {isFullscreen && (
          <div className="z-30 flex shrink-0 items-center justify-center gap-3 border-t border-white/10 bg-black/95 px-4 py-3 text-white">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              title="上一首"
              className="flex items-center gap-1 rounded-md bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden sm:inline">上一首</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              title="下一首"
              className="flex items-center gap-1 rounded-md bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="hidden sm:inline">下一首</span>
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setFsListOpen(v => !v)}
              title="播放列表"
              className={cn(
                'flex items-center gap-1 rounded-md px-4 py-2 text-sm transition-colors',
                fsListOpen
                  ? 'bg-[var(--color-primary)]/80 hover:bg-[var(--color-primary)]'
                  : 'bg-white/10 hover:bg-white/20',
              )}
            >
              <ListMusic className="h-5 w-5" />
              <span className="hidden sm:inline">列表</span>
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                title="删除当前视频（移到回收站）"
                className="flex items-center gap-1 rounded-md bg-[var(--color-destructive)]/30 px-4 py-2 text-sm transition-colors hover:bg-[var(--color-destructive)]"
              >
                <Trash2 className="h-5 w-5" />
                <span className="hidden sm:inline">删除</span>
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              title="退出全屏"
              className="flex items-center gap-1 rounded-md bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
            >
              <Minimize className="h-5 w-5" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        )}

        {isFullscreen && (
          <div
            className={cn(
              // bottom-[68px] leaves room for the control bar (py-3 + button h ~= 64-68px).
              'absolute right-0 top-0 z-20 flex w-80 max-w-[85vw] flex-col bg-black/85 text-white shadow-2xl backdrop-blur-md transition-transform duration-200',
              'bottom-[68px]',
              fsListOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="text-sm font-medium">播放列表</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-white/60">{items.length} 个</span>
                <button
                  type="button"
                  onClick={() => setFsListOpen(false)}
                  title="关闭"
                  className="rounded p-1 text-white/80 transition-colors hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto overscroll-contain">
              {items.map(it => {
                const isActive = it.path === item.path
                return (
                  <li key={it.path}>
                    <button
                      ref={isActive ? fsActiveRef : null}
                      type="button"
                      onClick={() => {
                        onSelect(it)
                        setFsListOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-start gap-2 border-b border-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10',
                        isActive && 'bg-[var(--color-primary)]/25',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            'line-clamp-2 break-all text-xs leading-tight',
                            isActive ? 'font-semibold text-white' : 'text-white/90',
                          )}
                          title={it.name}
                        >
                          {it.name}
                        </div>
                        <div className="mt-0.5 text-[10px] tabular-nums text-white/50">
                          {formatBytes(it.size)}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1 px-1">
        <div className="truncate text-sm font-medium" title={item.path}>{item.name}</div>
        <div className="truncate text-xs text-[var(--color-muted-foreground)]">
          {formatBytes(item.size)} · <span className="font-mono">{item.path}</span>
        </div>
      </div>

      <div className="px-1">
        <SubtitleControls
          key={item.path}
          scanId={item.scanId}
          videoPath={item.path}
          onJobChange={handleSubtitleJobChange}
          displayMode={subtitleMode}
          onDisplayModeChange={setSubtitleMode}
        />
      </div>

      {showStrip && (
        <div className="-mx-1 overflow-x-auto overscroll-contain md:hidden">
          <ul className="flex gap-2 px-1 pb-1">
            {queueWindow.map(it => {
              const isActive = it.path === item.path
              return (
                <li key={it.path} className="relative shrink-0">
                  <button
                    ref={isActive ? activeStripRef : null}
                    type="button"
                    onClick={() => onSelect(it)}
                    className={cn(
                      'relative h-20 w-36 overflow-hidden rounded-md border bg-black text-left transition-transform active:scale-[0.98]',
                      isActive
                        ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40'
                        : 'border-[var(--color-border)]',
                    )}
                  >
                    <VideoThumb scanId={it.scanId} path={it.path} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-3">
                      <div
                        className={cn(
                          'line-clamp-2 break-all text-[11px] leading-tight text-white',
                          isActive ? 'font-semibold' : 'font-medium',
                        )}
                        title={it.name}
                      >
                        {it.name}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] tabular-nums text-white/70">
                        {formatBytes(it.size)}
                      </div>
                    </div>
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        onDelete(it)
                      }}
                      title="删除（移到回收站）"
                      className="absolute right-1 top-1 rounded-md bg-black/55 p-1.5 text-white/90 backdrop-blur-sm transition-colors hover:bg-[var(--color-destructive)] hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 px-1 md:px-0">
        <Button
          variant="outline"
          size="lg"
          disabled={!hasPrev}
          onClick={onPrev}
          className="h-12 flex-1 md:flex-none md:px-6"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="ml-1">上一首</span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={onOpenList}
          className="h-12 px-4 md:hidden"
          title="打开列表"
        >
          <ListMusic className="h-5 w-5" />
          <span className="ml-1">列表</span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          disabled={!hasNext}
          onClick={onNext}
          className="h-12 flex-1 md:flex-none md:px-6"
        >
          <span className="mr-1">下一首</span>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {showStrip && (
        <div ref={previewRef} className="hidden min-h-0 flex-1 overflow-hidden md:block">
          {previewWindow.length > 0 && (
            <ul
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${previewCols}, minmax(0, 1fr))` }}
            >
              {previewWindow.map(it => {
                const isActive = it.path === item.path
                return (
                  <li key={it.path}>
                    <button
                      type="button"
                      onClick={() => onSelect(it)}
                      className={cn(
                        'flex w-full flex-col overflow-hidden rounded-md border bg-[var(--color-card)] text-left transition-colors',
                        isActive
                          ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40'
                          : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50',
                      )}
                    >
                      <div className="relative aspect-video w-full bg-black">
                        <VideoThumb scanId={it.scanId} path={it.path} />
                      </div>
                      <div className="space-y-0.5 p-2">
                        <div
                          className={cn(
                            'line-clamp-2 break-all text-xs leading-tight',
                            isActive ? 'font-semibold' : 'font-medium',
                          )}
                          title={it.name}
                        >
                          {it.name}
                        </div>
                        <div className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
                          {formatBytes(it.size)}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {showStrip && (() => {
        const queueItems = currentIndex >= 0 ? items.slice(currentIndex) : items
        const queueAllSelected = queueItems.length > 0 && queueItems.every(it => queueSelected.has(it.path))
        const toggleQueueAll = () => {
          setQueueSelected(prev => {
            if (queueAllSelected) {
              const next = new Set(prev)
              for (const it of queueItems) next.delete(it.path)
              return next
            }
            const next = new Set(prev)
            for (const it of queueItems) next.add(it.path)
            return next
          })
        }
        return (
          <div className="md:hidden">
            {queueMultiSelect ? (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-[var(--color-accent)]/40 px-2 py-1.5">
                <div className="text-xs font-medium">
                  已选 <span className="tabular-nums">{queueSelected.size}</span> / <span className="tabular-nums">{queueItems.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleQueueAll}
                    disabled={queueItems.length === 0 || queueBulkPending}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-[var(--color-accent)] disabled:opacity-50"
                  >
                    {queueAllSelected ? <Square className="h-3 w-3" /> : <CheckSquare className="h-3 w-3" />}
                    {queueAllSelected ? '取消全选' : '全选'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQueueBulkDelete(queueItems)}
                    disabled={queueSelected.size === 0 || queueBulkPending}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-2 py-1 text-[11px] text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/20 disabled:opacity-50"
                  >
                    {queueBulkPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    删除{queueSelected.size > 0 && ` (${queueSelected.size})`}
                  </button>
                  <button
                    type="button"
                    onClick={exitQueueMultiSelect}
                    disabled={queueBulkPending}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-[var(--color-accent)] disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                    退出
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div className="text-xs font-medium text-[var(--color-muted-foreground)]">队列</div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
                    {items.length} 个
                  </div>
                  {onBulkDelete && (
                    <button
                      type="button"
                      onClick={() => setQueueMultiSelect(true)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-[var(--color-accent)]"
                      title="进入多选模式，批量删除"
                    >
                      <CheckSquare className="h-3 w-3" />
                      多选
                    </button>
                  )}
                </div>
              </div>
            )}
            <ul className="grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
              {queueItems.map(it => {
                const isActive = it.path === item.path
                const isChecked = queueSelected.has(it.path)
                return (
                  <li key={it.path} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (queueMultiSelect) toggleQueueSelected(it.path)
                        else onSelect(it)
                      }}
                      className={cn(
                        'flex w-full flex-col overflow-hidden rounded-md border bg-[var(--color-card)] text-left transition-all active:scale-[0.98]',
                        queueMultiSelect && isChecked
                          ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/60'
                          : isActive
                            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40'
                            : 'border-[var(--color-border)]',
                      )}
                    >
                      <div className="relative aspect-video w-full bg-black">
                        <VideoThumb scanId={it.scanId} path={it.path} />
                      </div>
                      <div className="space-y-0.5 p-2">
                        <div
                          className={cn(
                            'line-clamp-2 break-all text-xs leading-tight',
                            isActive ? 'font-semibold' : 'font-medium',
                          )}
                          title={it.name}
                        >
                          {it.name}
                        </div>
                        <div className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
                          {formatBytes(it.size)}
                        </div>
                      </div>
                    </button>
                    {queueMultiSelect ? (
                      <div className="pointer-events-none absolute left-1 top-1 rounded-md bg-black/55 p-1 text-white backdrop-blur-sm">
                        {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 opacity-70" />}
                      </div>
                    ) : (
                      onDelete && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            onDelete(it)
                          }}
                          title="删除（移到回收站）"
                          className="absolute right-1 top-1 rounded-md bg-black/55 p-1.5 text-white/90 backdrop-blur-sm transition-colors hover:bg-[var(--color-destructive)] hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })()}
    </div>
  )
}
