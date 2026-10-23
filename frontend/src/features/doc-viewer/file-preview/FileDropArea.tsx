import { useEffect, useState, type DragEvent, type RefObject } from 'react'
import { FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  onFiles: (files: File[]) => void
  onChoose: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
}

function containsFiles(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes('Files')
}

export function FileDropArea({ onFiles, onChoose, buttonRef }: Props) {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const preventFileNavigation = (event: globalThis.DragEvent) => {
      if (containsFiles(event.dataTransfer)) event.preventDefault()
    }
    window.addEventListener('dragover', preventFileNavigation)
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventFileNavigation)
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!containsFiles(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }

  return (
    <section
      aria-label="直接打开文件"
      onDragOver={handleDragOver}
      onDragLeave={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={event => {
        if (!containsFiles(event.dataTransfer)) return
        event.preventDefault()
        setDragging(false)
        onFiles(Array.from(event.dataTransfer.files))
      }}
      className={cn('flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed px-4 py-5 transition-colors sm:px-6',
        dragging ? 'border-[var(--color-primary)] bg-[var(--color-selection)]' : 'border-[var(--color-border-strong)]')}
    >
      <div className="min-w-0 space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><FileUp className="size-4" aria-hidden="true" />直接打开文件</h2>
        <p className="text-sm">拖入文档即可预览，也可选择文件</p>
        <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">Markdown、HTML、TXT、RST、ADOC、draw.io · 每份最多 5 MiB · 仅在浏览器中读取</p>
      </div>
      <Button ref={buttonRef} type="button" variant="outline" className="min-h-11" onClick={onChoose}>选择文件</Button>
    </section>
  )
}
