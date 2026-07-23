import { useEffect } from 'react'
import { X } from 'lucide-react'

/** 图片灯箱：点击缩略图后全屏查看，点击空白/ESC/关闭按钮退出。fixed 覆盖视口，位于最上层。 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
    </div>
  )
}
