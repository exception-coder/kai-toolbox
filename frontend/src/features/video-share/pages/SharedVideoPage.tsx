import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Film, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

interface SharedVideoMeta {
  name: string
  size: number
  expiresAt: number
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; meta: SharedVideoMeta }
  | { kind: 'gone' }

/**
 * 分享链接的落地页：匿名、无侧边栏、无需登录。
 *
 * 播放走原生 {@code <video src>} 指向 {@code /api/share/{token}/raw} —— 后端裸流端点支持
 * Range/206，微信与 QQ 的内置浏览器都能直接拖进度条。刻意不用 hls.js：HLS 的分片地址不带
 * 凭证，匿名场景每片都会 401，而且收链接的人也不需要转码。
 *
 * 失效（撤销 / 过期 / 不存在）后端一律 404 且不区分原因，这里也只给一句中性的提示，
 * 不告诉访问者「这个 token 曾经存在」。
 */
export function SharedVideoPage() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })

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

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <video
          className="max-h-[85vh] w-full bg-black"
          src={`/api/share/${encodeURIComponent(token)}/raw`}
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
