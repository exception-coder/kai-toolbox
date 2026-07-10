import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * 图片查看器：全屏遮罩里居中显示原图，点背景/关闭按钮/Esc 关闭。
 * 桌面点击、移动端轻触均可打开（由调用方在缩略图上绑 onClick）；打开时锁背景滚动，避免移动端误触底层。
 * 复用于聊天历史图片（MessageList）与合成器附件预览（AttachmentChips）。
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-label="图片查看"
    >
      {/* 移动端可对图片双指缩放；点图片本身不关闭，点背景才关 */}
      <img
        src={src}
        alt={alt ?? '图片'}
        draggable={false}
        onClick={e => e.stopPropagation()}
        className="max-h-[92vh] max-w-full touch-pinch-zoom rounded-lg object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      >
        <X className="size-5" />
      </button>
    </div>
  )
}
