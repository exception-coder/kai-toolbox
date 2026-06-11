import { useRef, useState, type ChangeEvent } from 'react'
import { Paperclip, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/utils'

interface Props {
  disabled?: boolean
  onSubmitFiles: (files: File[]) => Promise<void> | void
}

export function AttachmentPicker({ disabled, onSubmitFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<File[]>([])

  function handlePick() {
    inputRef.current?.click()
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setPicked(files)
    e.target.value = ''
  }

  async function handleSubmit() {
    if (picked.length === 0 || busy || disabled) return
    setBusy(true)
    try {
      await onSubmitFiles(picked)
      setPicked([])
    } finally {
      setBusy(false)
    }
  }

  function handleRemove(idx: number) {
    setPicked(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-3 rounded-md border bg-[var(--color-muted)]/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={handlePick} disabled={disabled || busy}>
          <Paperclip className="size-3.5" />
          选择文件
        </Button>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {picked.length > 0 ? `已选 ${picked.length} 个` : '支持任意类型，可多选'}
        </span>
      </div>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleChange} />
      {picked.length > 0 && (
        <ul className="space-y-1 text-sm">
          {picked.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded border bg-[var(--color-background)] px-2 py-1.5"
            >
              <div className="min-w-0 flex-1 truncate">
                <span className="font-medium">{f.name}</span>
                <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                  {formatBytes(f.size)}
                </span>
              </div>
              <button
                type="button"
                className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                onClick={() => handleRemove(i)}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={picked.length === 0 || busy || disabled}>
          <Upload className="size-3.5" />
          {busy ? '上传中…' : `上传 ${picked.length > 0 ? picked.length : ''}`}
        </Button>
      </div>
    </div>
  )
}
