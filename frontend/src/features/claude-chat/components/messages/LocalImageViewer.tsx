import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { readSessionImage } from '../../api'
import { ImageLightbox } from '../ImageLightbox'

/** 点击消息里的本地图片路径后，经会话鉴权读取原图并全屏查看；手机端同样可用。 */
export function LocalImageViewer({ sessionId, path, onClose }: { sessionId: string; path: string; onClose: () => void }) {
  const [src, setSrc] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    readSessionImage(sessionId, path, controller.signal).then(blob => {
      objectUrl = URL.createObjectURL(blob)
      setSrc(objectUrl)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '图片暂时无法读取。')
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [sessionId, path])
  const name = path.split(/[\\/]/).pop() || path
  if (src) return <ImageLightbox src={src} alt={name} onClose={onClose} />
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" onClick={onClose} role="dialog" aria-label="图片查看">
      <p role="status" className="flex max-w-sm items-center gap-2 text-sm text-white" onClick={event => event.stopPropagation()}>
        {error ? <span>图片无法显示：{error}</span>
          : <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />正在加载 {name}…</>}
      </p>
      <button type="button" onClick={onClose} aria-label="关闭" className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70">
        <X className="size-5" />
      </button>
    </div>,
    document.body,
  )
}
