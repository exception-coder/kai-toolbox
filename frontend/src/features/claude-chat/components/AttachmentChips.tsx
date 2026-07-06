import { useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'
import type { UploadedAttachment } from '../api'
import { ImageLightbox } from './ImageLightbox'

type Item = UploadedAttachment & { previewUrl?: string }

/** 输入框上方的附件预览条：显示附件名/类型，图片可点击放大核对，可删除。 */
export function AttachmentChips({
  items,
  uploading,
  onRemove,
}: {
  items: Item[]
  uploading?: number
  onRemove: (id: string) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  if (!items.length && !uploading) return null
  return (
    <>
      <div className="flex flex-wrap gap-2 px-3 pt-2">
        {items.map(a => {
          const isImage = a.mime?.startsWith('image/')
          const canPreview = isImage && !!a.previewUrl
          return (
            <span
              key={a.id}
              className="flex items-center gap-1 rounded-full border bg-[var(--color-muted)] px-2 py-1 text-xs"
            >
              {canPreview ? (
                <button
                  type="button"
                  onClick={() => setPreview(a.previewUrl!)}
                  title="点击预览"
                  className="flex items-center gap-1"
                >
                  <img src={a.previewUrl} alt="" className="size-5 rounded object-cover" />
                  <span className="max-w-[10rem] truncate underline-offset-2 hover:underline">{a.name}</span>
                </button>
              ) : (
                <>
                  {isImage ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
                  <span className="max-w-[10rem] truncate" title={a.name}>{a.name}</span>
                </>
              )}
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label="移除附件"
                className="ml-0.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <X className="size-3.5" />
              </button>
            </span>
          )
        })}
        {!!uploading && (
          <span className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-[var(--color-muted-foreground)]">
            <Loader2 className="size-3.5 animate-spin" /> 上传中 {uploading}…
          </span>
        )}
      </div>

      {preview && <ImageLightbox src={preview} alt="预览" onClose={() => setPreview(null)} />}
    </>
  )
}
