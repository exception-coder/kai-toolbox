import { useEffect, useRef, useState, type DragEvent, type HTMLAttributes, type Ref } from 'react'
import { Paperclip } from 'lucide-react'

type Props = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>
  onFiles?: (files: FileList) => void | Promise<void>
  dropDisabled?: boolean
}
const containsFiles = (transfer: DataTransfer | null) => Boolean(transfer && Array.from(transfer.types).includes('Files'))

/** 复用同一附件入口；只接收系统文件，不消费文本或远程链接。 */
export function ConsultFileDropZone({ onFiles, dropDisabled, children, ...props }: Props) {
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!onFiles) return
    const preventNavigation = (event: globalThis.DragEvent) => {
      if (!containsFiles(event.dataTransfer) || event.defaultPrevented) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      if (event.type === 'drop') { depth.current = 0; setDragging(false) }
    }
    const reset = () => { depth.current = 0; setDragging(false) }
    window.addEventListener('dragover', preventNavigation)
    window.addEventListener('drop', preventNavigation)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('dragover', preventNavigation)
      window.removeEventListener('drop', preventNavigation)
      window.removeEventListener('blur', reset)
    }
  }, [Boolean(onFiles)])

  const drop = (event: DragEvent<HTMLDivElement>) => {
    if (!onFiles || !containsFiles(event.dataTransfer)) return
    event.preventDefault(); event.stopPropagation()
    depth.current = 0; setDragging(false); setError(null)
    if (dropDisabled) { setError('当前咨询暂不可接收附件，请等待会话恢复或当前处理完成'); return }
    const files = event.dataTransfer.files
    if (!files.length || Array.from(event.dataTransfer.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
      setError('请从文件管理器拖入文件，不支持拖入文件夹或链接'); return
    }
    try {
      void Promise.resolve(onFiles(files)).catch(() => setError('附件处理失败，请重试；原咨询内容已保留'))
    } catch {
      setError('附件处理失败，请重试；原咨询内容已保留')
    }
  }

  return <div {...props} onDragEnter={event => {
    if (!onFiles || !containsFiles(event.dataTransfer)) return
    event.preventDefault(); event.stopPropagation(); depth.current++; setDragging(true); setError(null)
  }} onDragOver={event => {
    if (!onFiles || !containsFiles(event.dataTransfer)) return
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = dropDisabled ? 'none' : 'copy'
  }} onDragLeave={event => {
    if (!onFiles || !containsFiles(event.dataTransfer)) return
    event.preventDefault(); event.stopPropagation(); depth.current = Math.max(0, depth.current - 1)
    if (!depth.current) setDragging(false)
  }} onDrop={drop}>
    {children}
    {dragging && <div role="status" className="pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-background)]/95 p-4 text-center text-sm">
      <Paperclip className="size-5" />
      {dropDisabled ? '当前咨询暂不可接收附件' : '松开即可添加到当前咨询'}
    </div>}
    {error && <p role="alert" className="absolute inset-x-3 bottom-3 z-50 rounded-md border bg-[var(--color-background)] p-3 text-xs text-[var(--color-destructive)]">
      {error}<button type="button" onClick={() => setError(null)} className="ml-2 min-h-11 underline">关闭提示</button>
    </p>}
  </div>
}
