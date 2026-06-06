import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import Hls, { type ErrorData, type Events } from 'hls.js'
import { cn } from '@/lib/utils'
import { getToken } from '@/lib/auth'
import { hlsPlaylistUrl, probeVideo, streamUrl } from '@/features/treesize/api'
import type { ProbeResult } from '@/features/treesize/types'
import { SubtitleOverlay, type SubtitleMode } from './SubtitleOverlay'
import { VideoPlayerControls } from './VideoPlayerControls'

interface VideoPlayerProps {
  scanId: string
  path: string
  /** Extra classes on the outer container (the {@code <video>} fills it). */
  className?: string
  /** Surfaced for the parent to render a "now playing" header. */
  onProbeResolved?: (probe: ProbeResult) => void
  /** WebVTT subtitle URL. When present a {@code <track>} element renders the cues over the video. */
  subtitleUrl?: string
  /** Server-translated VTT (e.g. Chinese). When present the overlay uses it instead of Translator API. */
  subtitleTranslatedUrl?: string
  /** ISO 639 code shown in the player's text-track menu. Falls back to {@code "und"} (undetermined). */
  subtitleLanguage?: string
  /** How to render cues. {@code off} suppresses the overlay entirely (browser native track also hidden). */
  subtitleMode?: SubtitleMode | 'off'
  /** BCP-47 target for the Translator API. Defaults to {@code zh-Hans} when not specified. */
  subtitleTargetLang?: string
  /** Optional prev/next handlers for the custom control bar. */
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
  /** Video title for the top bar. */
  title?: string
  /** 父容器需要保留播放器外层浮动按钮时，由父级接管全屏状态与动作。 */
  isFullscreen?: boolean
  onToggleFullscreen?: () => void | Promise<void>
  /** 字幕快捷开关 — 父级管 mode 状态，这里只透传给控件栏。 */
  subtitlesAvailable?: boolean
  subtitlesOn?: boolean
  onToggleSubtitles?: () => void
}

type Mode = 'loading' | 'native' | 'hls' | 'unsupported' | 'error' | 'unauthorized'
type ScreenOrientationMode = 'landscape' | 'portrait'
type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: ScreenOrientationMode) => Promise<void>
}

/**
 * Headless player core: probes the file, decides between direct stream and on-demand HLS,
 * wires up hls.js, and tears everything down on unmount.
 */
export function VideoPlayer({
  scanId,
  path,
  className,
  onProbeResolved,
  subtitleUrl,
  subtitleTranslatedUrl,
  subtitleLanguage,
  subtitleMode = 'original',
  subtitleTargetLang,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  title,
  isFullscreen: controlledFullscreen,
  onToggleFullscreen: controlledToggleFullscreen,
  subtitlesAvailable,
  subtitlesOn,
  onToggleSubtitles,
}: VideoPlayerProps) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [mode, setMode] = useState<Mode>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [screenOrientation, setScreenOrientation] = useState<ScreenOrientationMode>('landscape')

  useEffect(() => {
    setMode('loading')
    setErrorMsg(null)
    setProbe(null)

    let cancelled = false
    probeVideo(scanId, path)
      .then(result => {
        if (cancelled) return
        setProbe(result)
        onProbeResolved?.(result)
        if (!result.authorized) {
          // 探测被软鉴权拦截（未登录/无权限/登录态失效）——不是 ffmpeg 问题。
          setMode('unauthorized')
        } else if (result.nativelyPlayable) {
          setMode('native')
        } else if (result.ffmpegAvailable) {
          setMode('hls')
        } else {
          setMode('unsupported')
        }
      })
      .catch((e: Error) => {
        if (cancelled) return
        setErrorMsg(e.message)
        setMode('error')
      })

    return () => {
      cancelled = true
    }
  }, [scanId, path, onProbeResolved])

  // Native <video> error fallback: hls.js can miss decode failures when the segment "succeeds"
  // (200 OK, valid mpegts container) but produces corrupt frames — the browser raises an error
  // on the element instead. Without this listener the user sees a silent black frame and is
  // tempted to delete what's actually a healthy source file with a transcode-side bug.
  useEffect(() => {
    const video = videoEl
    if (!video) return
    const onError = () => {
      const err = video.error
      if (!err) return
      const codeName = ({
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      } as Record<number, string>)[err.code] ?? `code ${err.code}`
      setErrorMsg(`视频元素错误：${codeName}${err.message ? ` — ${err.message}` : ''}`)
      setMode('error')
    }
    video.addEventListener('error', onError)
    return () => video.removeEventListener('error', onError)
  }, [videoEl])

  useEffect(() => {
    const video = videoEl
    if (!video) return

    if (mode === 'native') {
      video.src = streamUrl(scanId, path)
      video.load()
    } else if (mode === 'hls') {
      const playlist = hlsPlaylistUrl(scanId, path)
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          backBufferLength: 30,
          manifestLoadingTimeOut: 20000,
          fragLoadingTimeOut: 60000,
          startFragPrefetch: true,
          // 给 playlist + 每个分片请求带上 JWT（开启软鉴权后流式端点也需鉴权；
          // playlist URL 已带 access_token 查询参数，这里再补头覆盖相对分片请求）。
          xhrSetup: (xhr: XMLHttpRequest) => {
            const t = getToken()
            if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`)
          },
        })
        hls.loadSource(playlist)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_evt: Events.ERROR, data: ErrorData) => {
          if (data.fatal) {
            setErrorMsg(`HLS 错误：${data.details ?? data.type}`)
            setMode('error')
          }
        })
        hlsRef.current = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlist
        video.load()
      } else {
        setErrorMsg('当前浏览器不支持 HLS 播放')
        setMode('error')
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [mode, scanId, path, videoEl])

  // Native fullscreen handling to sync state
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const effectiveFullscreen = controlledFullscreen ?? isFullscreen

  const toggleFullscreen = useCallback(async () => {
    if (controlledToggleFullscreen) {
      await controlledToggleFullscreen()
      return
    }
    if (!containerRef.current) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await containerRef.current.requestFullscreen()
      }
    } catch {
      /* ignore */
    }
  }, [controlledToggleFullscreen])

  const toggleScreenOrientation = useCallback(async () => {
    const next: ScreenOrientationMode = screenOrientation === 'landscape' ? 'portrait' : 'landscape'
    setScreenOrientation(next)
    try {
      if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
        await toggleFullscreen()
      }
      await (window.screen.orientation as LockableScreenOrientation | undefined)?.lock?.(next)
    } catch {
      /* 浏览器不支持锁定方向时，保留播放器比例切换作为兜底反馈 */
    }
  }, [screenOrientation, toggleFullscreen])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full bg-black group/player overflow-hidden transition-[max-width,aspect-ratio] duration-300',
        screenOrientation === 'landscape'
          ? 'aspect-video'
          : 'mx-auto aspect-[9/16] max-h-[min(82vh,760px)] max-w-[min(100%,430px)]',
        className,
      )}
    >
      <video
        ref={setVideoEl}
        autoPlay
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        className="h-full w-full object-contain transition-transform duration-300 ease-in-out"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {subtitleUrl && subtitleMode !== 'off' && (
          <track
            key={subtitleUrl}
            kind="subtitles"
            label="原文"
            src={subtitleUrl}
            srcLang={subtitleLanguage || 'und'}
          />
        )}
        {subtitleTranslatedUrl && subtitleMode !== 'off' && (
          <track
            key={subtitleTranslatedUrl}
            kind="subtitles"
            label="中文"
            src={subtitleTranslatedUrl}
            srcLang="zh"
          />
        )}
      </video>

      {/* Custom Controls */}
      {videoEl && mode !== 'loading' && mode !== 'error' && (
        <VideoPlayerControls
          video={videoEl}
          isFullscreen={effectiveFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={hasPrev}
          hasNext={hasNext}
          title={title}
          onAutoNext={onNext}
          onRotate={setRotation}
          onToggleOrientation={toggleScreenOrientation}
          screenOrientation={screenOrientation}
          subtitlesAvailable={subtitlesAvailable}
          subtitlesOn={subtitlesOn}
          onToggleSubtitles={onToggleSubtitles}
        />
      )}

      {subtitleUrl && subtitleMode !== 'off' && (
        <SubtitleOverlay
          video={videoEl}
          mode={subtitleMode}
          sourceLang={subtitleLanguage ?? ''}
          targetLang={subtitleTargetLang}
        />
      )}
      {mode === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 bg-black/40">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2 text-sm">探测中…</span>
        </div>
      )}
      {mode === 'unauthorized' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/90 bg-black/60">
          <div>请登录后播放</div>
          <div className="text-xs text-white/60">
            视频库已开启访问控制，需用具备「管理员 / 视频库」权限的账号登录（右上角登录）。
          </div>
        </div>
      )}
      {mode === 'unsupported' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/90 bg-black/60">
          <div>浏览器无法直接播放此格式，且后端 FFmpeg 不可用。</div>
          <div className="text-xs text-white/60">
            请在 application.yml 配置 <code className="font-mono">toolbox.ffmpeg.binary</code> 后重启服务。
          </div>
        </div>
      )}
      {mode === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/90 bg-black/60">
          <div>播放失败</div>
          {errorMsg && <div className="text-xs text-white/60">{errorMsg}</div>}
          <div className="mt-2 max-w-md text-[11px] leading-relaxed text-amber-200/80">
            ⚠️ 转码失败不一定代表文件损坏。删除前请用其他播放器（VLC / mpv / PotPlayer）打开确认。
          </div>
        </div>
      )}
      {probe && mode === 'hls' && !effectiveFullscreen && (
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/70 z-20">
          转码 · {probe.videoCodec}
          {probe.audioCodec !== '(none)' && ` + ${probe.audioCodec}`}
        </div>
      )}
    </div>
  )
}
