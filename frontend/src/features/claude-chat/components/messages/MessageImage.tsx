import { useState } from 'react'
import { ImageOff, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import '../../styles/message-content.css'

/** 加载和失败都有可读状态，重试仅重新读取原图片，不触发 Agent。 */
export function MessageImage({ src, alt, className, onOpen }: {
  src: string; alt: string; className?: string; onOpen?: (src: string, alt: string) => void
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  return <span className="cc-message-image block max-w-full">
    {state === 'loading' && <span role="status" className="cc-image-notice">
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />正在加载图片…
    </span>}
    {state === 'failed' ? <span role="status" className="cc-image-notice">
      <ImageOff className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0"><span className="block">图片加载失败{alt ? ` · ${alt}` : ''}</span>
        <span className="block text-xs">检查图片链接或文件是否仍可访问。</span></span>
      <button type="button" className="cc-image-retry" aria-label={`重试图片${alt ? ` ${alt}` : ''}`}
        onClick={event => { event.preventDefault(); event.stopPropagation(); setState('loading'); setAttempt(value => value + 1) }}>
        <RotateCcw className="size-3.5" aria-hidden="true" />重试
      </button>
    </span> : <img key={attempt} src={src} alt={alt} loading="lazy"
      onLoad={() => setState('loaded')} onError={() => setState('failed')}
      onClick={onOpen ? () => onOpen(src, alt) : undefined}
      onKeyDown={onOpen ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(src, alt) } } : undefined}
      tabIndex={onOpen && state === 'loaded' ? 0 : undefined} role={onOpen ? 'button' : undefined}
      aria-label={onOpen ? `查看大图 ${alt}` : undefined}
      className={cn('max-w-full rounded-lg', state === 'loading' && 'absolute size-px opacity-0', onOpen && 'cursor-zoom-in', className)} />}
  </span>
}
