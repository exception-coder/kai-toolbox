import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'
import type { UploadedAttachment } from '../api'

/** 输入框上方的附件预览条：显示已上传附件的名字与类型图标，可删除。 */
export function AttachmentChips({
  items,
  uploading,
  onRemove,
}: {
  items: UploadedAttachment[]
  uploading?: number
  onRemove: (id: string) => void
}) {
  if (!items.length && !uploading) return null
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {items.map(a => (
        <span
          key={a.id}
          className="flex items-center gap-1 rounded-full border bg-[var(--color-muted)] px-2 py-1 text-xs"
        >
          {a.mime?.startsWith('image/') ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
          <span className="max-w-[10rem] truncate" title={a.name}>{a.name}</span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label="移除附件"
            className="ml-0.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {!!uploading && (
        <span className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-[var(--color-muted-foreground)]">
          <Loader2 className="size-3.5 animate-spin" /> 上传中 {uploading}…
        </span>
      )}
    </div>
  )
}
