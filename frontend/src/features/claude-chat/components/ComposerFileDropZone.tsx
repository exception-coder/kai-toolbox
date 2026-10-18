import { useEffect, useRef, useState, type DragEvent, type HTMLAttributes } from 'react'
import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onDrop' | 'onDragEnter' | 'onDragOver' | 'onDragLeave'> & {
  sessionId: string
  onFiles?: (files: FileList) => void | Promise<void>
  disabledReason?: string
}
const hasFiles = (transfer: DataTransfer | null) => !!transfer && Array.from(transfer.types).includes('Files')

/** 只接收系统文件；拖入提示不遮挡输入，窗口外落点仅阻止浏览器打开文件。 */
export function ComposerFileDropZone({ sessionId, onFiles, disabledReason, children, className, ...props }: Props) {
  const depth = useRef(0)
  const generation = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const reset = () => { depth.current = 0; setDragging(false) }
    generation.current++; reset(); setError(null)
    if (!onFiles) return
    const preventNavigation = (event: globalThis.DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return
      if (!event.defaultPrevented) {
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      }
      if (event.type === 'drop') reset()
    }
    window.addEventListener('dragover', preventNavigation)
    window.addEventListener('drop', preventNavigation)
    window.addEventListener('dragend', reset)
    window.addEventListener('blur', reset)
    return () => {
      generation.current++
      window.removeEventListener('dragover', preventNavigation)
      window.removeEventListener('drop', preventNavigation)
      window.removeEventListener('dragend', reset)
      window.removeEventListener('blur', reset)
    }
    // 接收能力与会话决定生命周期，上传回调可随草稿状态重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, Boolean(onFiles)])

  const drop = (event: DragEvent<HTMLDivElement>) => {
    if (!onFiles || !hasFiles(event.dataTransfer)) return
    event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); setError(null)
    if (disabledReason) { setError(disabledReason); return }
    if (!event.dataTransfer.files.length || Array.from(event.dataTransfer.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
      setError('请拖入具体文件；暂不支持文件夹'); return
    }
    const current = generation.current
    const failed = () => { if (current === generation.current) setError('附件处理失败，请重新拖入；原草稿已保留') }
    try { void Promise.resolve(onFiles(event.dataTransfer.files)).catch(failed) } catch { failed() }
  }

  return <div {...props} className={cn('relative', className)} onDrop={drop}
    onDragEnter={event => {
      if (!onFiles || !hasFiles(event.dataTransfer)) return
      event.preventDefault(); event.stopPropagation(); depth.current++; setDragging(true); setError(null)
    }} onDragOver={event => {
      if (!onFiles || !hasFiles(event.dataTransfer)) return
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = disabledReason ? 'none' : 'copy'
    }} onDragLeave={event => {
      if (!onFiles || !hasFiles(event.dataTransfer)) return
      event.preventDefault(); event.stopPropagation(); depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setDragging(false)
    }}>
    {children}
    {dragging && <div role="status" className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center gap-2 rounded-md border border-dashed border-[var(--color-primary)] bg-[var(--color-background)]/95 p-3 text-sm">
      <Paperclip className="size-4 shrink-0" />{disabledReason || '松开即可添加附件'}
    </div>}
    {error && <p role="alert" className="flex items-center gap-2 px-3 pb-2 text-xs text-[var(--color-destructive)]">
      <span className="min-w-0 flex-1 break-words">{error}</span>
      <button type="button" onClick={() => setError(null)} className="min-h-11 shrink-0 underline">关闭提示</button>
    </p>}
  </div>
}
