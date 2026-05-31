import { useEffect, useRef, useState } from 'react'
import Hls, { type ErrorData, type Events } from 'hls.js'
import type { PlayKind } from '../types'

interface Props {
  /** 播放地址（后端返回的 playUrl，已含 /api 前缀）。 */
  playUrl: string
  /** 投递类型，决定用 video / hls.js / img 哪种壳。 */
  playKind: PlayKind
}

/**
 * 三态播放壳：
 * - native → {@code <video src>} 直接播放 mp4 产物
 * - hls    → hls.js 加载 m3u8（Safari 原生 HLS 回退）
 * - mjpeg  → {@code <img src>} 接 multipart/x-mixed-replace 帧流（无音频）
 *
 * 调用方通过 {@code key={runId}} 强制重挂，确保切模式时彻底拆掉上一个播放器（含 hls.js destroy）。
 */
export function LabPlayer({ playUrl, playKind }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (playKind !== 'hls') return
    const video = videoRef.current
    if (!video) return

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hls.loadSource(playUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_e: Events.ERROR, data: ErrorData) => {
        if (data.fatal) setError(`HLS 错误：${data.details ?? data.type}`)
      })
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playUrl
    } else {
      setError('当前浏览器不支持 HLS 播放')
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [playUrl, playKind])

  if (playKind === 'mjpeg') {
    return (
      <div className="flex flex-col items-center gap-2">
        {/* MJPEG 多段流：img 直接消费 multipart/x-mixed-replace，无音频 */}
        <img src={playUrl} alt="MJPEG 帧流" className="max-h-[60vh] w-auto rounded-md bg-black" />
        <div className="text-xs text-[var(--color-muted-foreground)]">MJPEG 帧流 · 无音频</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        src={playKind === 'native' ? playUrl : undefined}
        className="max-h-[60vh] w-full rounded-md bg-black"
        onError={() => {
          const code = videoRef.current?.error?.code
          if (code) setError(`视频元素错误：code ${code}`)
        }}
      />
      {error && <div className="text-xs text-[var(--color-destructive)]">{error}</div>}
    </div>
  )
}
