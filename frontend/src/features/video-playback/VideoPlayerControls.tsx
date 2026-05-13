import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  RotateCw,
  Smartphone,
  Monitor,
  Captions,
  CaptionsOff,
  MoreHorizontal,
  ChevronsRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoPlayerControlsProps {
  video: HTMLVideoElement | null
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
  title?: string
  onAutoNext?: () => void
  onRotate?: (degrees: number) => void
  onToggleOrientation?: () => void
  screenOrientation?: 'landscape' | 'portrait'
  /** When true, render the captions quick-toggle button. */
  subtitlesAvailable?: boolean
  subtitlesOn?: boolean
  onToggleSubtitles?: () => void
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const SKIP_TIMES = [5, 10, 15, 30]
const DOUBLE_TAP_MS = 280
const LONG_PRESS_MS = 500
const LONG_PRESS_RATE = 2
const IDLE_MS = 3000

type MenuKey = null | 'speed' | 'skip' | 'more'
type TapSide = 'left' | 'right' | 'center'

export function VideoPlayerControls({
  video,
  isFullscreen,
  onToggleFullscreen,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  title,
  onAutoNext,
  onRotate,
  onToggleOrientation,
  screenOrientation = 'landscape',
  subtitlesAvailable = false,
  subtitlesOn = false,
  onToggleSubtitles,
}: VideoPlayerControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  const [showControls, setShowControls] = useState(true)
  const [menu, setMenu] = useState<MenuKey>(null)
  const [skipTime, setSkipTime] = useState(10)
  const [rotation, setRotation] = useState(0)

  const [isDragging, setIsDragging] = useState(false)
  const [hoverPct, setHoverPct] = useState<number | null>(null)

  const [seekHint, setSeekHint] = useState<{ side: 'left' | 'right'; amount: number; id: number } | null>(null)
  const [longPressActive, setLongPressActive] = useState(false)

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef<{ ts: number; side: TapSide } | null>(null)
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Long-press temporarily forces 2× — we suppress the `ratechange` listener
  // from leaking that value into UI state via a ref read inside the listener.
  const prevRateRef = useRef<number>(1)
  const longPressActiveRef = useRef(false)

  useEffect(() => {
    if (!video) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTimeUpdate = () => {
      if (!isDragging) setCurrentTime(video.currentTime)
    }
    const onDurationChange = () => setDuration(video.duration)
    const onVolumeChange = () => {
      setVolume(video.volume)
      setIsMuted(video.muted)
    }
    const onRateChange = () => {
      if (!longPressActiveRef.current) setPlaybackRate(video.playbackRate)
    }
    const onEnded = () => {
      setIsPlaying(false)
      onAutoNext?.()
    }
    const onProgress = () => {
      const b = video.buffered
      if (!b.length || !video.duration) return
      let end = 0
      for (let i = 0; i < b.length; i++) {
        if (video.currentTime >= b.start(i) && video.currentTime <= b.end(i) + 0.5) {
          end = b.end(i)
        }
      }
      if (end === 0) end = b.end(b.length - 1)
      setBuffered(end / video.duration)
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('ratechange', onRateChange)
    video.addEventListener('ended', onEnded)
    video.addEventListener('progress', onProgress)

    setIsPlaying(!video.paused)
    setCurrentTime(video.currentTime)
    setDuration(video.duration || 0)
    setVolume(video.volume)
    setIsMuted(video.muted)
    setPlaybackRate(video.playbackRate)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('volumechange', onVolumeChange)
      video.removeEventListener('ratechange', onRateChange)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('progress', onProgress)
    }
  }, [video, isDragging, onAutoNext])

  const resetIdle = useCallback(() => {
    setShowControls(true)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (isPlaying && menu === null && !isDragging) {
      idleTimer.current = setTimeout(() => setShowControls(false), IDLE_MS)
    }
  }, [isPlaying, menu, isDragging])

  useEffect(() => {
    resetIdle()
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [resetIdle])

  useEffect(
    () => () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!seekHint) return
    const t = setTimeout(() => setSeekHint(null), 650)
    return () => clearTimeout(t)
  }, [seekHint?.id])

  const togglePlay = useCallback(() => {
    if (!video) return
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
    resetIdle()
  }, [video, resetIdle])

  const skip = useCallback(
    (seconds: number) => {
      if (!video || !isFinite(video.duration)) return
      video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration))
    },
    [video],
  )

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (!video || !isFinite(video.duration)) return
      const t = Math.max(0, Math.min(ratio * video.duration, video.duration))
      video.currentTime = t
      setCurrentTime(t)
    },
    [video],
  )

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`
  }

  const handleRotate = () => {
    const next = (rotation + 90) % 360
    setRotation(next)
    onRotate?.(next)
    resetIdle()
  }

  const progressRatio = (clientX: number) => {
    const el = progressRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const handleProgressDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    seekToRatio(progressRatio(e.clientX))
  }
  const handleProgressMove = (e: React.PointerEvent) => {
    const r = progressRatio(e.clientX)
    setHoverPct(r)
    if (isDragging) seekToRatio(r)
  }
  const handleProgressUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setIsDragging(false)
  }

  // ─── Gesture surface ────────────────────────────────────────────────
  // single tap → toggle play (+ reveal controls)
  // double tap (left/right third) → skip ±N s with visual hint
  // long press (≥500 ms) → temp 2× speed, restored on release
  const surfacePointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      if (!video || video.paused) return
      prevRateRef.current = video.playbackRate
      longPressActiveRef.current = true
      setLongPressActive(true)
      try {
        video.playbackRate = LONG_PRESS_RATE
      } catch {
        longPressActiveRef.current = false
        setLongPressActive(false)
      }
    }, LONG_PRESS_MS)
  }

  const cancelLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const endLongPress = () => {
    if (!longPressActiveRef.current) return
    longPressActiveRef.current = false
    setLongPressActive(false)
    if (video) {
      try {
        video.playbackRate = prevRateRef.current
      } catch {
        /* ignore */
      }
    }
  }

  const surfacePointerUp = (e: React.PointerEvent) => {
    cancelLongPressTimer()
    if (longPressActiveRef.current) {
      endLongPress()
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const side: TapSide = ratio < 0.35 ? 'left' : ratio > 0.65 ? 'right' : 'center'

    const now = Date.now()
    const prev = lastTapRef.current

    if (prev && now - prev.ts < DOUBLE_TAP_MS && prev.side === side && side !== 'center') {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current)
        singleTapTimer.current = null
      }
      const amount = side === 'left' ? -skipTime : skipTime
      skip(amount)
      setSeekHint({ side, amount, id: now })
      lastTapRef.current = null
      resetIdle()
      return
    }

    lastTapRef.current = { ts: now, side }
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current)
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null
      togglePlay()
    }, DOUBLE_TAP_MS)
  }

  const surfaceCancel = () => {
    cancelLongPressTimer()
    endLongPress()
  }

  const ratio = duration > 0 ? currentTime / duration : 0
  const previewRatio = isDragging ? ratio : hoverPct ?? null

  return (
    <div
      className={cn('absolute inset-0 z-10 select-none', showControls ? '' : 'cursor-none')}
      onMouseMove={resetIdle}
    >
      {/* Gesture surface — sits behind everything; the bars hand off taps via pointer-events:none */}
      <div
        className="absolute inset-0 touch-manipulation"
        onPointerDown={surfacePointerDown}
        onPointerUp={surfacePointerUp}
        onPointerCancel={surfaceCancel}
        onPointerLeave={surfaceCancel}
      />

      {/* Double-tap seek hint */}
      {seekHint && (
        <div
          key={seekHint.id}
          className={cn(
            'pointer-events-none absolute inset-y-0 flex items-center justify-center animate-seek-flash',
            seekHint.side === 'left' ? 'left-0 w-[38%]' : 'right-0 w-[38%]',
          )}
        >
          <div className="flex flex-col items-center gap-1 rounded-full bg-black/55 px-5 py-4 text-white backdrop-blur-sm">
            {seekHint.side === 'left' ? <RotateCcw className="size-7" /> : <RotateCw className="size-7" />}
            <span className="text-xs font-semibold tabular-nums">{Math.abs(seekHint.amount)}s</span>
          </div>
        </div>
      )}

      {/* Long-press 2× indicator */}
      {longPressActive && (
        <div className="pointer-events-none absolute left-1/2 top-[15%] z-20 -translate-x-1/2 animate-pop-in">
          <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-1.5 text-white backdrop-blur">
            <ChevronsRight className="size-4" />
            <span className="text-sm font-semibold tabular-nums">{LONG_PRESS_RATE}× 倍速</span>
          </div>
        </div>
      )}

      {/* Gradient — purely visual */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/45 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Top bar — pointer-events-none on container; buttons inside opt back in */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 px-3 pt-2 transition-opacity duration-300 md:px-4 md:pt-3',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-white drop-shadow md:text-sm" title={title}>
          {title}
        </div>
      </div>

      {/* Center play indicator — visible while paused */}
      {!isPlaying && !longPressActive && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            togglePlay()
          }}
          className={cn(
            'absolute left-1/2 top-1/2 z-10 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-transform hover:scale-105 md:size-20',
          )}
          aria-label="播放"
        >
          <Play className="size-7 fill-current md:size-9" />
        </button>
      )}

      {/* Bottom bar */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-2 pb-2 transition-opacity duration-300 md:gap-2 md:px-4 md:pb-3',
          showControls ? 'opacity-100' : 'opacity-0',
        )}
      >
        {/* Progress */}
        <div className="px-1">
          <div
            ref={progressRef}
            className="group/p pointer-events-auto relative flex h-5 cursor-pointer items-center touch-none"
            onPointerDown={handleProgressDown}
            onPointerMove={handleProgressMove}
            onPointerUp={handleProgressUp}
            onPointerLeave={() => {
              if (!isDragging) setHoverPct(null)
            }}
          >
            <div
              className={cn(
                'pointer-events-none relative w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150',
                isDragging ? 'h-2' : 'h-1 group-hover/p:h-1.5',
              )}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/35"
                style={{ width: `${buffered * 100}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-primary)]"
                style={{ width: `${ratio * 100}%` }}
              />
              {previewRatio !== null && !isDragging && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/25"
                  style={{ width: `${previewRatio * 100}%` }}
                />
              )}
            </div>
            <div
              className={cn(
                'pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full bg-[var(--color-primary)] shadow ring-2 ring-white/40 transition-transform duration-150',
                isDragging ? 'scale-125' : 'scale-100 md:scale-0 md:group-hover/p:scale-100',
              )}
              style={{ left: `${ratio * 100}%` }}
            />
            {previewRatio !== null && (
              <div
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-[10px] tabular-nums text-white shadow"
                style={{ left: `${previewRatio * 100}%` }}
              >
                {formatTime(previewRatio * duration)}
              </div>
            )}
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-1 text-white md:gap-2">
          {/* Left cluster: play + desktop skip + desktop volume */}
          <div className="flex items-center gap-0.5 md:gap-1.5">
            <CtrlBtn onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
              {isPlaying ? (
                <Pause className="size-5 fill-current md:size-6" />
              ) : (
                <Play className="size-5 fill-current md:size-6" />
              )}
            </CtrlBtn>

            <CtrlBtn
              className="hidden md:inline-flex"
              onClick={() => {
                skip(-skipTime)
                resetIdle()
              }}
              title={`后退 ${skipTime}s`}
            >
              <RotateCcw className="size-5" />
              <span className="absolute mt-0.5 text-[8px] font-bold">{skipTime}</span>
            </CtrlBtn>
            <CtrlBtn
              className="hidden md:inline-flex"
              onClick={() => {
                skip(skipTime)
                resetIdle()
              }}
              title={`快进 ${skipTime}s`}
            >
              <RotateCw className="size-5" />
              <span className="absolute mt-0.5 text-[8px] font-bold">{skipTime}</span>
            </CtrlBtn>

            <div className="hidden md:flex items-center gap-1">
              <CtrlBtn
                onClick={() => {
                  if (video) video.muted = !isMuted
                }}
                title={isMuted || volume === 0 ? '取消静音' : '静音'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-5" />
                ) : volume < 0.5 ? (
                  <Volume1 className="size-5" />
                ) : (
                  <Volume2 className="size-5" />
                )}
              </CtrlBtn>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={e => {
                  if (video) {
                    video.volume = parseFloat(e.target.value)
                    video.muted = false
                  }
                }}
                className="w-20 accent-[var(--color-primary)]"
              />
            </div>
          </div>

          <div className="ml-1 min-w-fit font-mono text-[11px] tabular-nums opacity-85 md:ml-2 md:text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          <div className="flex-1" />

          {/* Right cluster */}
          <div className="flex items-center gap-0.5 md:gap-1.5">
            {hasPrev && (
              <CtrlBtn
                onClick={() => {
                  onPrev?.()
                  resetIdle()
                }}
                title="上一个"
              >
                <ChevronLeft className="size-5" />
              </CtrlBtn>
            )}
            {hasNext && (
              <CtrlBtn
                onClick={() => {
                  onNext?.()
                  resetIdle()
                }}
                title="下一个"
              >
                <ChevronRight className="size-5" />
              </CtrlBtn>
            )}

            {subtitlesAvailable && onToggleSubtitles && (
              <CtrlBtn
                active={subtitlesOn}
                onClick={() => {
                  onToggleSubtitles()
                  resetIdle()
                }}
                title={subtitlesOn ? '关闭字幕' : '打开字幕'}
              >
                {subtitlesOn ? <Captions className="size-5" /> : <CaptionsOff className="size-5" />}
              </CtrlBtn>
            )}

            {/* Speed (popover on desktop, sheet on mobile) */}
            <div className="relative">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  setMenu(menu === 'speed' ? null : 'speed')
                }}
                className={cn(
                  'pointer-events-auto inline-flex h-9 min-w-10 items-center justify-center rounded-md px-2 text-xs font-semibold text-white transition-colors hover:bg-white/15',
                  menu === 'speed' && 'bg-white/20',
                )}
                title="播放倍速"
              >
                {playbackRate}×
              </button>
              {menu === 'speed' && (
                <div className="pointer-events-auto absolute bottom-full right-0 z-30 mb-2 hidden w-32 flex-col rounded-lg border border-white/10 bg-black/95 p-1 shadow-xl backdrop-blur md:flex">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-white/40">播放倍速</div>
                  {SPEEDS.map(s => (
                    <MenuItem
                      key={s}
                      selected={playbackRate === s}
                      onClick={() => {
                        if (video) video.playbackRate = s
                        setMenu(null)
                      }}
                    >
                      {s}×
                    </MenuItem>
                  ))}
                </div>
              )}
            </div>

            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  setMenu(menu === 'skip' ? null : 'skip')
                }}
                className={cn(
                  'pointer-events-auto inline-flex h-9 min-w-10 items-center justify-center rounded-md px-2 text-xs font-semibold text-white transition-colors hover:bg-white/15',
                  menu === 'skip' && 'bg-white/20',
                )}
                title="跳跃秒数"
              >
                {skipTime}s
              </button>
              {menu === 'skip' && (
                <div className="pointer-events-auto absolute bottom-full right-0 z-30 mb-2 flex w-32 flex-col rounded-lg border border-white/10 bg-black/95 p-1 shadow-xl backdrop-blur">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-white/40">跳跃秒数</div>
                  {SKIP_TIMES.map(t => (
                    <MenuItem
                      key={t}
                      selected={skipTime === t}
                      onClick={() => {
                        setSkipTime(t)
                        setMenu(null)
                      }}
                    >
                      {t}s
                    </MenuItem>
                  ))}
                </div>
              )}
            </div>

            <CtrlBtn className="hidden md:inline-flex" onClick={handleRotate} title="画面旋转">
              <RotateCw
                className="size-5 transition-transform duration-200"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            </CtrlBtn>
            {onToggleOrientation && (
              <CtrlBtn
                className="hidden md:inline-flex"
                onClick={() => {
                  onToggleOrientation()
                  resetIdle()
                }}
                title={screenOrientation === 'landscape' ? '切到竖屏' : '切到横屏'}
              >
                {screenOrientation === 'landscape' ? (
                  <Smartphone className="size-5" />
                ) : (
                  <Monitor className="size-5" />
                )}
              </CtrlBtn>
            )}

            <CtrlBtn
              className="md:hidden"
              active={menu === 'more'}
              onClick={() => setMenu(menu === 'more' ? null : 'more')}
              title="更多"
            >
              <MoreHorizontal className="size-5" />
            </CtrlBtn>

            <CtrlBtn onClick={onToggleFullscreen} title={isFullscreen ? '退出全屏' : '进入全屏'}>
              {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </CtrlBtn>
          </div>
        </div>
      </div>

      {/* Mobile sheets */}
      {menu === 'more' && (
        <BottomSheet onClose={() => setMenu(null)}>
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => {
                if (video) video.muted = !isMuted
              }}
              className="flex size-9 items-center justify-center rounded-full bg-white/10"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="size-5" />
              ) : volume < 0.5 ? (
                <Volume1 className="size-5" />
              ) : (
                <Volume2 className="size-5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={e => {
                if (video) {
                  video.volume = parseFloat(e.target.value)
                  video.muted = false
                }
              }}
              className="flex-1 accent-[var(--color-primary)]"
            />
            <div className="w-10 text-right font-mono text-xs tabular-nums text-white/70">
              {Math.round((isMuted ? 0 : volume) * 100)}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase text-white/40">双击跳跃秒数</div>
            <div className="grid grid-cols-4 gap-2">
              {SKIP_TIMES.map(t => (
                <button
                  key={t}
                  onClick={() => setSkipTime(t)}
                  className={cn(
                    'rounded-md py-2 text-sm font-medium transition-colors',
                    skipTime === t
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-white/10 text-white/80 hover:bg-white/15',
                  )}
                >
                  {t}s
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleRotate}
              className="flex items-center justify-center gap-2 rounded-md bg-white/10 py-2.5 text-sm font-medium hover:bg-white/15"
            >
              <RotateCw
                className="size-4 transition-transform"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
              旋转 {rotation}°
            </button>
            {onToggleOrientation && (
              <button
                onClick={() => {
                  onToggleOrientation()
                  resetIdle()
                }}
                className="flex items-center justify-center gap-2 rounded-md bg-white/10 py-2.5 text-sm font-medium hover:bg-white/15"
              >
                {screenOrientation === 'landscape' ? (
                  <Smartphone className="size-4" />
                ) : (
                  <Monitor className="size-4" />
                )}
                {screenOrientation === 'landscape' ? '切竖屏' : '切横屏'}
              </button>
            )}
          </div>
        </BottomSheet>
      )}

      {menu === 'speed' && (
        <BottomSheet className="md:hidden" onClose={() => setMenu(null)}>
          <div className="mb-2 text-[10px] font-semibold uppercase text-white/40">播放倍速</div>
          <div className="grid grid-cols-3 gap-2">
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => {
                  if (video) video.playbackRate = s
                  setMenu(null)
                }}
                className={cn(
                  'rounded-md py-3 text-sm font-semibold transition-colors',
                  playbackRate === s
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-white/10 text-white/85 hover:bg-white/15',
                )}
              >
                {s}×
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  )
}

function CtrlBtn({
  children,
  onClick,
  title,
  className,
  active = false,
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title?: string
  className?: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        onClick(e)
      }}
      title={title}
      className={cn(
        'pointer-events-auto relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-white transition-colors',
        active ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-white/15',
        className,
      )}
    >
      {children}
    </button>
  )
}

function MenuItem({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'rounded px-3 py-2 text-left text-xs transition-colors hover:bg-white/10',
        selected ? 'font-bold text-[var(--color-primary)]' : 'text-white/75',
      )}
    >
      {children}
    </button>
  )
}

function BottomSheet({
  children,
  onClose,
  className,
}: {
  children: React.ReactNode
  onClose: () => void
  className?: string
}) {
  return (
    <div
      className={cn('pointer-events-auto absolute inset-0 z-30 flex flex-col justify-end md:hidden', className)}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative rounded-t-2xl border-t border-white/10 bg-black/95 p-4 text-white backdrop-blur animate-slide-up"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        {children}
      </div>
    </div>
  )
}
