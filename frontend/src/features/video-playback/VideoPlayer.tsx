import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Hls, { type ErrorData, type Events } from 'hls.js'
import { cn } from '@/lib/utils'
import { hlsPlaylistUrl, probeVideo, streamUrl } from '@/features/treesize/api'
import type { ProbeResult } from '@/features/treesize/types'
import { SubtitleOverlay, type SubtitleMode } from './SubtitleOverlay'

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
}

type Mode = 'loading' | 'native' | 'hls' | 'unsupported' | 'error'

/**
 * Headless player core: probes the file, decides between direct stream and on-demand HLS,
 * wires up hls.js, and tears everything down on unmount (which is what triggers the backend
 * ffmpeg process to die). Containers (modal, library panel) wrap this with their own chrome.
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
}: VideoPlayerProps) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [mode, setMode] = useState<Mode>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [probe, setProbe] = useState<ProbeResult | null>(null)

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
        if (result.nativelyPlayable) {
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

  useEffect(() => {
    const video = videoEl
    if (!video) return

    if (mode === 'native') {
      video.src = streamUrl(scanId, path)
      video.load()
    } else if (mode === 'hls') {
      const playlist = hlsPlaylistUrl(scanId, path)
      if (Hls.isSupported()) {
        // Larger buffer windows so the player has runway while ffmpeg spins up the next
        // segment; with 10 s segments this means ~6 segments ahead which absorbs a slow
        // re-encode on the first byte without stalling playback.
        const hls = new Hls({
          enableWorker: true,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          backBufferLength: 30,
          manifestLoadingTimeOut: 20000,
          fragLoadingTimeOut: 60000,
          startFragPrefetch: true,
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
        // iOS Safari has native HLS support; skip hls.js entirely.
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
      // Stop the underlying GET so the backend ffmpeg process can wind down.
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [mode, scanId, path, videoEl])

  return (
    <div className={cn('relative aspect-video w-full bg-black', className)}>
      <video
        ref={setVideoEl}
        controls
        autoPlay
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        className="h-full w-full"
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
      {subtitleUrl && subtitleMode !== 'off' && (
        <SubtitleOverlay
          video={videoEl}
          mode={subtitleMode}
          sourceLang={subtitleLanguage ?? ''}
          targetLang={subtitleTargetLang}
        />
      )}
      {mode === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2 text-sm">探测中…</span>
        </div>
      )}
      {mode === 'unsupported' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/90">
          <div>浏览器无法直接播放此格式，且后端 FFmpeg 不可用。</div>
          <div className="text-xs text-white/60">
            请在 application.yml 配置 <code className="font-mono">toolbox.ffmpeg.binary</code> 后重启服务。
          </div>
        </div>
      )}
      {mode === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/90">
          <div>播放失败</div>
          {errorMsg && <div className="text-xs text-white/60">{errorMsg}</div>}
        </div>
      )}
      {probe && mode === 'hls' && (
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/70">
          转码 · {probe.videoCodec}
          {probe.audioCodec !== '(none)' && ` + ${probe.audioCodec}`}
        </div>
      )}
    </div>
  )
}
