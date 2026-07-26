import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Film, Loader2 } from 'lucide-react'
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
 * 实时转码。分享的 HLS 分片是相对地址、token 在路径里，因此分片天然带凭证。
 *
 * <p><b>播放失败一律给出可见原因 + 下载兜底</b>：这个页面的访客是「别人」，他既没有
 * DevTools 也没有耐心，静默黑屏等于让分享者背锅。尤其安卓微信的 X5 内核对 MSE 支持不稳，
 * hls.js 可能直接跑不起来 —— 这种情况必须明说，并让他能把原文件存下来用本地播放器看。
 *
 * 链接失效（撤销 / 过期 / 不存在）后端一律 404 且不区分原因，这里也只给中性提示，
 * 不告诉访问者「这个 token 曾经存在」。
 */
export function SharedVideoPage() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [playError, setPlayError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const rawUrl = `/api/share/${encodeURIComponent(token)}/raw`

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

  // HLS 挂载。Safari / iOS 原生支持 m3u8，直接给 src（那边也没有 MSE，只有这条路）；
  // 其余浏览器用 hls.js 接管，并把致命错误显示出来而不是留一块黑屏。
  const needsHls = state.kind === 'ready' && state.meta.playable === 'hls'
  useEffect(() => {
    const video = videoRef.current
    if (!needsHls || !video) return
    const src = `/api/share/${encodeURIComponent(token)}/hls/playlist.m3u8`

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }
    if (!Hls.isSupported()) {
      // 典型是安卓微信/QQ 的 X5 内核：没有可用的 MSE，hls.js 无从挂载
      setPlayError('当前浏览器不支持在线播放这种格式的视频。可以点下方按钮下载后用本地播放器观看，或用系统浏览器打开本页面。')
      return
    }
    const hls = new Hls({ enableWorker: true })
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      // 只有 fatal 才打断：非致命错误 hls.js 会自行重试，弹出来只会吓到访客
      if (!data.fatal) return
      setPlayError(`播放失败（${data.details}）。可以下载后用本地播放器观看。`)
    })
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

  const cannotPlay = state.meta.playable === 'none'

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {cannotPlay ? (
          <div className="flex flex-col items-center gap-3 px-8 text-center text-white/70">
            <Film className="h-10 w-10 opacity-40" />
            <div className="text-sm">这个视频无法在线播放</div>
            <div className="max-w-xs text-xs text-white/40">
              它的格式需要服务端实时转码，但分享者的服务端当前没有可用的 FFmpeg。
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="max-h-[85vh] w-full bg-black"
            // HLS 的 src 由上面的 effect 挂（hls.js 或 Safari 原生），这里只管裸流那条路
            src={state.meta.playable === 'native' ? rawUrl : undefined}
            poster={`/api/share/${encodeURIComponent(token)}/thumb`}
            controls
            autoPlay
            playsInline
            // 收链接的人多半在移动网络上，别一进页面就替他把整片拉下来
            preload="metadata"
            onError={() => setPlayError('这个视频在当前浏览器里播放失败，可以下载后用本地播放器观看。')}
          />
        )}
      </div>

      <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 text-center">
        <div className="break-all text-sm font-medium text-white/90">{state.meta.name}</div>
        <div className="mt-1 text-xs text-white/40">
          {formatBytes(state.meta.size)} · 有效期至 {new Date(state.meta.expiresAt).toLocaleDateString()}
        </div>

        {playError && (
          <div className="mx-auto mt-3 max-w-sm rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
            {playError}
          </div>
        )}

        {/* 下载兜底常驻：在线播不了时是唯一退路，播得了时也方便对方存档。
            用 a[download] 直接指向裸流 —— 不需要额外端点，浏览器自己会存成文件。 */}
        <a
          href={rawUrl}
          download={state.meta.name}
          className="mx-auto mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-white/15 px-4 text-xs text-white/80 transition-colors hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" />
          下载原文件
        </a>
      </div>
    </div>
  )
}
