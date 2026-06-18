import { useEffect, useRef, useState } from 'react'
import { Loader2, Paperclip, Send, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadAttachment } from '../api'
import type { AttachmentView, ModelInfo } from '../types'

interface Props {
  models: ModelInfo[]
  selectedModel: string
  streaming: boolean
  disabled: boolean
  /** 外部灌入的草稿（如空状态点能力建议）；变化即填入输入框，随后回调父清空以便重复触发。 */
  seed?: string
  onSeedApplied?: () => void
  onSend: (content: string, attachments: AttachmentView[]) => void
  onStop: () => void
}

export function Composer(props: Props) {
  const { models, selectedModel, streaming, disabled, seed } = props
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<AttachmentView[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 外部 seed 灌入输入框（追加到已输入内容后），随即回调父清空，使再次点选同一建议仍能触发
  useEffect(() => {
    if (!seed) return
    setContent((prev) => (prev.trim() ? `${prev} ${seed}` : seed))
    props.onSeedApplied?.()
  }, [seed])

  const multimodal = models.find((m) => m.id === selectedModel)?.multimodal ?? false

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const uploaded: AttachmentView[] = []
      for (const f of Array.from(files)) {
        uploaded.push(await uploadAttachment(f))
      }
      setAttachments((prev) => [...prev, ...uploaded])
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function submit() {
    const text = content.trim()
    if (!text && attachments.length === 0) return
    props.onSend(text, attachments)
    setContent('')
    setAttachments([])
    setError(null)
  }

  return (
    <div className="border-t bg-[var(--color-background)] p-3">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative">
              <img src={a.url} alt={a.name} className="size-16 rounded-md border object-cover" />
              <button
                className="absolute -right-1 -top-1 rounded-full bg-[var(--color-destructive)] p-0.5 text-[var(--color-destructive-foreground)]"
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                title="移除"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-2 text-xs text-[var(--color-destructive)]">{error}</p>}

      <div className="flex items-end gap-2">
        {multimodal && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => pickFiles(e.target.files)}
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={streaming || disabled || uploading}
              onClick={() => fileRef.current?.click()}
              title="添加图片"
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
            </Button>
          </>
        )}
        <textarea
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
          rows={1}
          placeholder={disabled ? '先新建或选择一个对话' : '输入消息，Enter 发送，Shift+Enter 换行'}
          value={content}
          disabled={disabled}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !streaming) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {streaming ? (
          <Button variant="destructive" size="icon" onClick={props.onStop} title="停止">
            <Square />
          </Button>
        ) : (
          <Button size="icon" disabled={disabled} onClick={submit} title="发送">
            <Send />
          </Button>
        )}
      </div>
    </div>
  )
}
