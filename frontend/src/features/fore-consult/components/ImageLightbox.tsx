import { useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'

/** 独立图片浮层，避免咨询面板的层叠上下文把关闭入口盖在移动顶栏下。 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const portalContainer = useFullscreenPortalContainer()
  const returnFocus = useRef<HTMLElement | null>(null)
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
    <Dialog.Portal container={portalContainer}>
      <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/85" />
      <Dialog.Content aria-describedby={undefined}
        onEscapeKeyDown={event => event.stopPropagation()}
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
        onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }) }}
        onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}
        className="fixed inset-0 z-[121] flex min-h-0 flex-col text-white outline-none">
        <header className="flex shrink-0 items-center justify-between gap-4 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
          <Dialog.Title className="text-sm font-medium">图片预览</Dialog.Title>
          <Dialog.Close aria-label="关闭图片预览" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <X className="size-4" aria-hidden="true" />关闭
          </Dialog.Close>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
          onClick={event => { if (event.target === event.currentTarget) onClose() }}>
          <img src={src} alt={alt ?? '咨询附件'} draggable={false} className="max-h-full max-w-full touch-pinch-zoom object-contain" />
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
