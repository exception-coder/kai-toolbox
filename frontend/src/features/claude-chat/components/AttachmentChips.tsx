import { useState } from 'react'
import { AlertCircle, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'
import type { UploadedAttachment } from '../api'
import { ImageLightbox } from './ImageLightbox'

type Item = UploadedAttachment & { previewUrl?: string; url?: string }

/** 输入框上方的附件预览条：显示附件名/类型，图片可点击放大核对，可删除。 */
export function AttachmentChips({
  items,
  uploading,
  error,
  onDismissError,
  onRemove,
}: {
  items: Item[]
  uploading?: number
  error?: string | null
  onDismissError?: () => void
  onRemove: (id: string) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  if (!items.length && !uploading && !error) return null
  return (
    <>
      <div className="flex flex-wrap gap-2 px-3 pt-2">
        {items.map(a => {
          const isImage = a.mime?.startsWith('image/')
          const previewUrl = a.previewUrl ?? a.url
          const canPreview = isImage && !!previewUrl
          return (
            <span
              key={a.id}
              className="flex items-center gap-1 rounded-full border bg-[var(--color-muted)] px-2 py-1 text-xs"
            >
              {canPreview ? (
                <button
                  type="button"
                  onClick={() => setPreview(previewUrl!)}
                  title="点击预览"
                  className="flex items-center gap-1"
                >
                  <img src={previewUrl} alt="" className="size-5 rounded object-cover" />
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
        {error && (
          <span
            role="alert"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1 text-xs text-red-700 dark:text-red-300"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="truncate">{error}</span>
            <span className="shrink-0 text-red-600/70 dark:text-red-300/70">请重新粘贴或选择文件</span>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                aria-label="关闭附件上传错误"
                className="ml-0.5 shrink-0 rounded p-0.5 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        )}
      </div>

      {preview && <ImageLightbox src={preview} alt="预览" onClose={() => setPreview(null)} />}
    </>
  )
}
