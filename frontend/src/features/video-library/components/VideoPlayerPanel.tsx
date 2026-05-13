import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckSquare, ChevronLeft, ChevronRight, ListMusic, Loader2, Maximize, Minimize, Square, Star, Trash2, X } from 'lucide-react'
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
  /** Toggle favorite for any item. Wired by the page; same handler the list panel uses. */
  onToggleFavorite: (item: VideoLibraryItem) => void
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
export function VideoPlayerPanel({ item, items, hasPrev, hasNext, onPrev, onNext, onSelect, onOpenList, onDelete, onBulkDelete, onToggleFavorite }: Props) {
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
  // Remembers the last non-"off" mode so the captions quick-toggle on the player can flip
  // back to whatever the user last had on, instead of always landing on "dual".
  const lastActiveSubMode = useRef<Exclude<SubtitleDisplayMode, 'off'>>('dual')

  // The current video changed — drop any subtitle state immediately so the player doesn't
  // briefly render the previous file's <track>. {@link SubtitleControls} will refetch.
  useEffect(() => {
    setSubtitleJob(null)
  }, [item?.path])

  useEffect(() => {
    if (subtitleMode !== 'off') lastActiveSubMode.current = subtitleMode
  }, [subtitleMode])

  const handleSubtitleToggle = useCallback(() => {
    setSubtitleMode(prev => (prev === 'off' ? lastActiveSubMode.current : 'off'))
  }, [])

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
          'relative overflow-hidden rounded-md bg-black transition-all duration-300',
          isFullscreen && 'fixed inset-0 z-50 rounded-none',
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
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={hasPrev}
          hasNext={hasNext}
          title={item.name}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          subtitlesAvailable={Boolean(subtitleUrl || subtitleTranslatedUrl)}
          subtitlesOn={subtitleMode !== 'off'}
          onToggleSubtitles={handleSubtitleToggle}
          className={cn(isFullscreen && 'aspect-auto h-full')}
        />

        {/* Fullscreen Overlay Controls (Playlist, Delete, etc.) */}
        {isFullscreen && (
          <>
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFsListOpen(v => !v)}
                title="播放列表"
                className={cn(
                  'rounded-full p-2.5 backdrop-blur-md transition-colors',
                  fsListOpen
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-black/50 text-white hover:bg-black/70',
                )}
              >
                <ListMusic className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onToggleFavorite(item)}
                title={item.favorited ? '取消收藏' : '收藏'}
                className={cn(
                  'rounded-full p-2.5 backdrop-blur-md transition-colors',
                  item.favorited
                    ? 'bg-amber-400 text-white'
                    : 'bg-black/50 text-white hover:bg-black/70 hover:text-amber-300',
                )}
              >
                <Star className={cn('h-5 w-5', item.favorited && 'fill-current')} />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  title="删除"
                  className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-red-500"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>

            <div
              className={cn(
                'absolute right-0 top-0 bottom-[68px] z-30 flex w-80 max-w-[85vw] flex-col bg-black/85 text-white shadow-2xl backdrop-blur-md transition-transform duration-300',
                fsListOpen ? 'translate-x-0' : 'translate-x-full',
              )}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="text-sm font-medium">播放列表 ({items.length})</div>
                <button
                  type="button"
                  onClick={() => setFsListOpen(false)}
                  className="rounded p-1 text-white/60 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ul className="flex-1 overflow-y-auto p-1">
                {items.map(it => {
                  const isActive = it.path === item.path
                  return (
                    <li key={it.path} className="group relative">
                      <button
                        ref={isActive ? fsActiveRef : null}
                        type="button"
                        onClick={() => {
                          onSelect(it)
                          setFsListOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                          isActive ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              'line-clamp-2 text-xs font-medium',
                              isActive ? 'text-primary' : 'text-white/80',
                            )}
                          >
                            {it.name}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          onToggleFavorite(it)
                        }}
                        className={cn(
                          'absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 transition-opacity',
                          it.favorited ? 'text-amber-400 opacity-100' : 'text-white/40',
                        )}
                      >
                        <Star className={cn('h-3.5 w-3.5', it.favorited && 'fill-current')} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}
      </div>

      <div className="flex min-w-0 items-start gap-2 px-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={item.path}>{item.name}</div>
          <div className="truncate text-xs text-[var(--color-muted-foreground)]">
            {formatBytes(item.size)} · <span className="font-mono">{item.path}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(item)}
          title={item.favorited ? '取消收藏' : '收藏'}
          className={cn(
            'shrink-0 rounded-md border px-2 py-1.5 text-xs transition-colors',
            item.favorited
              ? 'border-amber-400/60 bg-amber-400/15 text-amber-600 dark:text-amber-300'
              : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-amber-500',
          )}
        >
          <Star className={cn('inline h-3.5 w-3.5', item.favorited && 'fill-current')} />
          <span className="ml-1">{item.favorited ? '已收藏' : '收藏'}</span>
        </button>
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
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onToggleFavorite(it)
                    }}
                    title={it.favorited ? '取消收藏' : '收藏'}
                    className={cn(
                      'absolute left-1 top-1 rounded-md p-1.5 backdrop-blur-sm transition-colors',
                      it.favorited
                        ? 'bg-amber-400/85 text-white'
                        : 'bg-black/55 text-white/85 hover:bg-amber-400/70 hover:text-white',
                    )}
                  >
                    <Star className={cn('h-3.5 w-3.5', it.favorited && 'fill-current')} />
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
                  <li key={it.path} className="relative">
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
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        onToggleFavorite(it)
                      }}
                      title={it.favorited ? '取消收藏' : '收藏'}
                      className={cn(
                        'absolute right-1 top-1 rounded-md p-1.5 backdrop-blur-sm transition-colors',
                        it.favorited
                          ? 'bg-amber-400/85 text-white'
                          : 'bg-black/55 text-white/85 hover:bg-amber-400/70 hover:text-white',
                      )}
                    >
                      <Star className={cn('h-3.5 w-3.5', it.favorited && 'fill-current')} />
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
                      <>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            onToggleFavorite(it)
                          }}
                          title={it.favorited ? '取消收藏' : '收藏'}
                          className={cn(
                            'absolute left-1 top-1 rounded-md p-1.5 backdrop-blur-sm transition-colors',
                            it.favorited
                              ? 'bg-amber-400/85 text-white'
                              : 'bg-black/55 text-white/85 hover:bg-amber-400/70 hover:text-white',
                          )}
                        >
                          <Star className={cn('h-3.5 w-3.5', it.favorited && 'fill-current')} />
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
                      </>
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
