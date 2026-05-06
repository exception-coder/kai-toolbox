import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ListMusic, Trash2 } from 'lucide-react'
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
export function VideoPlayerPanel({ item, items, hasPrev, hasNext, onPrev, onNext, onSelect, onOpenList, onDelete }: Props) {
  const activeStripRef = useRef<HTMLButtonElement | null>(null)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [subtitleJob, setSubtitleJob] = useState<SubtitleJob | null>(null)
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
      <div className="overflow-hidden rounded-md bg-black">
        <VideoPlayer
          key={item.path}
          scanId={item.scanId}
          path={item.path}
          subtitleUrl={subtitleUrl}
          subtitleTranslatedUrl={subtitleTranslatedUrl}
          subtitleLanguage={subtitleLanguage}
          subtitleMode={subtitleMode}
        />
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
                <li key={it.path} className="shrink-0">
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

      {showStrip && (
        <div className="md:hidden">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <div className="text-xs font-medium text-[var(--color-muted-foreground)]">队列</div>
            <div className="text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
              {items.length} 个
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
            {items.map(it => {
              const isActive = it.path === item.path
              return (
                <li key={it.path} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelect(it)}
                    className={cn(
                      'flex w-full flex-col overflow-hidden rounded-md border bg-[var(--color-card)] text-left transition-all active:scale-[0.98]',
                      isActive
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
    </div>
  )
}
