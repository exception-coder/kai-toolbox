import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VideoPlayer } from '@/features/video-playback/VideoPlayer'

interface VideoPlayerModalProps {
  scanId: string
  path: string
  name: string
  open: boolean
  onClose: () => void
}

export function VideoPlayerModal({ scanId, path, name, open, onClose }: VideoPlayerModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={o => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/80 transition-opacity duration-150',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(96vw,1200px)] -translate-x-1/2 -translate-y-1/2',
            'rounded-lg bg-black shadow-2xl',
            'transition-all duration-150',
            'data-[state=closed]:scale-95 data-[state=closed]:opacity-0',
            'data-[state=open]:scale-100 data-[state=open]:opacity-100',
            'focus:outline-none',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">视频播放器</DialogPrimitive.Description>

          <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-white/90">
            <div className="min-w-0 truncate" title={path}>
              <span className="font-medium">{name}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <VideoPlayer scanId={scanId} path={path} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
