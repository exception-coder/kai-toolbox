import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { ExternalLink, FileText, Loader2, Paperclip, X } from 'lucide-react'
import { parseAttachment, uploadImageAttachment } from '../../api'
import {
  composeClarificationAnswer,
  createAttachmentId,
  escapeMarkdownLabel,
  parseClarificationAnswer,
  sanitizeAttachmentContent,
  type ClarificationAnswerAttachment,
} from '../../lib/clarificationAnswerAttachments'
import { ImageLightbox } from '../ImageLightbox'

const ACCEPTED_ATTACHMENTS = 'image/*,.md,.txt,.pdf,.docx,.doc,.xlsx,.xls'
const MAX_ATTACHMENTS_PER_ANSWER = 5

export function ClarificationAnswerComposer({
  value,
  onChange,
  onKeyDown,
  onBlur,
  onUploadingChange,
  textareaRef,
  rows,
  placeholder,
  embedded = false,
}: {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onBlur?: () => void
  onUploadingChange?: (uploading: boolean) => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  rows: number
  placeholder: string
  embedded?: boolean
}) {
  const inputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null)
  const parsed = parseClarificationAnswer(value)

  useEffect(() => { valueRef.current = value }, [value])

  const setUploadingState = (next: boolean) => {
    setUploading(next)
    onUploadingChange?.(next)
  }

  const updateAttachments = (updater: (current: ClarificationAnswerAttachment[]) => ClarificationAnswerAttachment[]) => {
    const current = parseClarificationAnswer(valueRef.current)
    const next = composeClarificationAnswer(current.text, updater(current.attachments))
    valueRef.current = next
    onChange(next)
  }

  const handleFiles = async (files: File[]) => {
    if (files.length === 0 || uploading) return
    const currentAttachmentCount = parseClarificationAnswer(valueRef.current).attachments.length
    if (currentAttachmentCount + files.length > MAX_ATTACHMENTS_PER_ANSWER) {
      setUploadError(`每次回答最多补充 ${MAX_ATTACHMENTS_PER_ANSWER} 个附件`)
      return
    }
    setUploadError(null)
    setUploadingState(true)
    try {
      const uploaded = await Promise.all(files.map(async (file): Promise<ClarificationAnswerAttachment> => {
        if (file.type.startsWith('image/')) {
          const image = await uploadImageAttachment(file)
          const label = escapeMarkdownLabel(image.name)
          return {
            id: createAttachmentId(),
            kind: 'image',
            name: image.name,
            url: image.url,
            markdownBody: `### 补充图片：${label}\n\n![${label}](${image.url})`,
            truncated: false,
          }
        }
        const document = await parseAttachment(file)
        const label = escapeMarkdownLabel(document.fileName)
        const content = sanitizeAttachmentContent(document.text)
        return {
          id: createAttachmentId(),
          kind: 'document',
          name: document.fileName,
          url: document.url,
          markdownBody: `### 补充资料：${label}\n\n[下载原文件](${document.url})\n\n#### 资料解析内容\n\n${content}${document.truncated ? '\n\n（内容已截断）' : ''}`,
          truncated: document.truncated,
        }
      }))
      updateAttachments((current) => [...current, ...uploaded])
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '附件上传失败，请重试')
    } finally {
      setUploadingState(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className={embedded
      ? 'bg-[var(--color-input)] focus-within:ring-1 focus-within:ring-inset focus-within:ring-[var(--color-ring)]'
      : 'flex-1 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] focus-within:ring-1 focus-within:ring-[var(--color-ring)]'}>
      <textarea
        ref={textareaRef}
        value={parsed.text}
        onChange={(event) => {
          const next = composeClarificationAnswer(event.target.value, parsed.attachments)
          valueRef.current = next
          onChange(next)
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onPaste={(event) => {
          const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
          if (images.length === 0) return
          event.preventDefault()
          void handleFiles(images)
        }}
        rows={rows}
        placeholder={placeholder}
        className="block w-full resize-none bg-transparent px-3 py-2 text-sm focus:outline-none"
      />

      {parsed.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)]/70 px-2.5 py-2">
          {parsed.attachments.map((attachment) => (
            <div key={attachment.id} className="flex max-w-full items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-1">
              {attachment.kind === 'image' ? (
                <button
                  type="button"
                  onClick={() => setPreviewImage({ src: attachment.url, alt: attachment.name })}
                  className="cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                  aria-label={`预览图片 ${attachment.name}`}
                >
                  <img src={attachment.url} alt="" className="h-6 w-6 rounded object-cover" />
                </button>
              ) : (
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-primary)]" />
              )}
              <span className="max-w-40 truncate text-[11px] text-[var(--color-foreground)]">{attachment.name}</span>
              <button
                type="button"
                onClick={() => updateAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:text-red-500"
                aria-label={`移除附件 ${attachment.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-8 items-center justify-between gap-2 border-t border-[var(--color-border)]/70 px-2.5 py-1.5">
        <label
          htmlFor={inputId}
          className={`flex cursor-pointer items-center gap-1 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {uploading ? '上传解析中…' : '补充图片或资料'}
        </label>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_ATTACHMENTS}
          multiple
          className="sr-only"
          onChange={(event) => void handleFiles(Array.from(event.target.files ?? []))}
        />
        <span className="hidden text-[10px] text-[var(--color-muted-foreground)] sm:inline">也可粘贴截图</span>
      </div>
      <div aria-live="polite">
        {uploadError && <p className="border-t border-red-500/20 px-2.5 py-1.5 text-[11px] text-red-500">{uploadError}</p>}
      </div>
      {previewImage && (
        <ImageLightbox src={previewImage.src} alt={previewImage.alt} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  )
}

export function ClarificationAnswerView({ value }: { value: string }) {
  const parsed = parseClarificationAnswer(value)
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null)
  return (
    <div className="space-y-2 text-left">
      {parsed.text && <p className="whitespace-pre-wrap break-words">{parsed.text}</p>}
      {parsed.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {parsed.attachments.map((attachment) => attachment.kind === 'image' ? (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setPreviewImage({ src: attachment.url, alt: attachment.name })}
              className="block cursor-zoom-in overflow-hidden rounded-md border border-[var(--color-primary)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              aria-label={`预览图片 ${attachment.name}`}
            >
              <img src={attachment.url} alt={`补充图片：${attachment.name}`} className="h-20 w-28 object-cover" />
            </button>
          ) : (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-full items-center gap-1.5 rounded-md border border-[var(--color-primary)]/20 bg-[var(--color-card)]/70 px-2 py-1 text-[11px] hover:border-[var(--color-primary)]/40"
            >
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{attachment.name}</span>
              {attachment.truncated && <span className="flex-shrink-0 text-amber-500">已截断</span>}
              <ExternalLink className="h-3 w-3 flex-shrink-0 text-[var(--color-muted-foreground)]" />
            </a>
          ))}
        </div>
      )}
      {!parsed.text && parsed.attachments.length === 0 && (
        <span className="text-[var(--color-muted-foreground)]">未填写</span>
      )}
      {previewImage && (
        <ImageLightbox src={previewImage.src} alt={previewImage.alt} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  )
}
