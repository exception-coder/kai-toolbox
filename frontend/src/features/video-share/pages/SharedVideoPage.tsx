import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Film, Loader2 } from 'lucide-react'
import Hls from 'hls.js'
import { formatBytes } from '@/lib/utils'

interface SharedVideoMeta {
  name: string
  size: number
  expiresAt: number
  /** native = 浏览器可直接播原文件；hls = 需实时转码；none = 需转码但服务端没有 FFmpeg。 */
  playable: 'native' | 'hls' | 'none'
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; meta: SharedVideoMeta }
  | { kind: 'gone' }

/**
 * 分享链接的落地页：匿名、无侧边栏、无需登录。
 *
 * 播放方式由后端 {@code meta.playable} 决定，前端不按扩展名猜：
 * 浏览器能直接解的走裸流（支持 Range，可拖进度条）；avi / mkv / HEVC 这类啃不动的走 HLS
 * 实时转码。分享的 HLS 分片是相对地址、token 在路径里，因此分片天然带凭证，
 * 不需要工作台内那套「hls.js 手动注 Authorization 头」的做法。
 *
 * 失效（撤销 / 过期 / 不存在）后端一律 404 且不区分原因，这里也只给一句中性的提示，
 * 不告诉访问者「这个 token 曾经存在」。
 */
export function SharedVideoPage() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('gone'))))
      .then((meta: SharedVideoMeta) => alive && setState({ kind: 'ready', meta }))
      .catch(() => alive && setState({ kind: 'gone' }))
    return () => {
      alive = false
    }
  }, [token])

  // HLS 挂载。Safari / iOS 原生支持 m3u8，直接给 src 即可（也只有这条路能用，
  // 那边没有 MSE）；其余浏览器用 hls.js 接管。
  const needsHls = state.kind === 'ready' && state.meta.playable === 'hls'
  useEffect(() => {
    const video = videoRef.current
    if (!needsHls || !video) return
    const src = `/api/share/${encodeURIComponent(token)}/hls/playlist.m3u8`
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }
    if (!Hls.isSupported()) return
    const hls = new Hls({ enableWorker: true })
    hls.loadSource(src)
    hls.attachMedia(video)
    return () => hls.destroy()
  }, [needsHls, token])

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white/70">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="ml-2 text-sm">加载中…</span>
      </div>
    )
  }

  if (state.kind === 'gone') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-8 text-center text-white/70">
        <Film className="h-10 w-10 opacity-40" />
        <div className="text-sm">链接已失效</div>
        <div className="max-w-xs text-xs text-white/40">
          分享可能已被取消或超过有效期。可以找分享者重新发一个。
        </div>
      </div>
    )
  }

  if (state.meta.playable === 'none') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-8 text-center text-white/70">
        <Film className="h-10 w-10 opacity-40" />
        <div className="text-sm">这个视频暂时无法播放</div>
        <div className="max-w-xs text-xs text-white/40">
          它的格式需要服务端实时转码，但分享者的服务端当前没有可用的 FFmpeg。
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={videoRef}
          className="max-h-[85vh] w-full bg-black"
          // HLS 的 src 由上面的 effect 挂（hls.js 或 Safari 原生），这里只管裸流那条路
          src={state.meta.playable === 'native' ? `/api/share/${encodeURIComponent(token)}/raw` : undefined}
          poster={`/api/share/${encodeURIComponent(token)}/thumb`}
          controls
          autoPlay
          playsInline
          // 收链接的人多半在移动网络上，别一进页面就替他把整片拉下来
          preload="metadata"
        />
      </div>
      <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 text-center">
        <div className="break-all text-sm font-medium text-white/90">{state.meta.name}</div>
        <div className="mt-1 text-xs text-white/40">
          {formatBytes(state.meta.size)} · 有效期至 {new Date(state.meta.expiresAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}
