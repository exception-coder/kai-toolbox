import { useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, Paperclip, Sparkles, X } from 'lucide-react'
import {
  parsePrdAttachment,
  uploadPrdImage,
  type PrdAttachmentParseResult,
  type PrdImageAttachmentResult,
} from '@/lib/prdAttachments'
import { messageOf } from '../lib/stageDialogUtils'

export function GenerationSupplementDialog({
  kind,
  onClose,
  onConfirm,
}: {
  kind: 'PRD' | 'TDD'
  onClose: () => void
  onConfirm: (extraInstructions: string) => void
}) {
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<PrdAttachmentParseResult[]>([])
  const [images, setImages] = useState<PrdImageAttachmentResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !uploading) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, uploading])

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError('')
    try {
      const selected = Array.from(files)
      const imageFiles = selected.filter(file => file.type.startsWith('image/'))
      const documentFiles = selected.filter(file => !file.type.startsWith('image/'))
      const [parsedDocuments, uploadedImages] = await Promise.all([
        Promise.all(documentFiles.map(parsePrdAttachment)),
        Promise.all(imageFiles.map(uploadPrdImage)),
      ])
      setAttachments(current => [...current, ...parsedDocuments])
      setImages(current => [...current, ...uploadedImages])
    } catch (cause) {
      setError(messageOf(cause, '附件上传失败'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const confirm = () => {
    const sections = [notes.trim()]
    if (attachments.length > 0) {
      sections.push(attachments.map(attachment =>
        `[📎 附件：${attachment.fileName}](${attachment.url})\n---\n【附件：${attachment.fileName}】\n${attachment.text}${attachment.truncated ? '\n（内容已截断）' : ''}\n---`
      ).join('\n\n'))
    }
    if (images.length > 0) {
      sections.push(images.map((item, index) =>
        `![补充截图${index + 1}](${item.url})`
      ).join('\n'))
    }
    onConfirm(sections.filter(Boolean).join('\n\n'))
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-0 backdrop-blur-sm sm:p-4"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tdd-generation-confirm-title"
        className="flex h-full w-full max-w-lg flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:h-auto sm:max-h-[85vh]"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">Before generation</p>
            <h3 id="tdd-generation-confirm-title" className="mt-1 text-base font-semibold">{kind} 生成前补充</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">澄清答案已经保留。可补充额外信息、参考文档或界面截图，不填写也可以直接生成。</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div>
            <label htmlFor="tdd-extra-instructions" className="text-xs font-medium">额外说明（可选）</label>
            <textarea
              id="tdd-extra-instructions"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={5}
              autoFocus
              placeholder={kind === 'PRD'
                ? '例如：补充目标用户、业务边界、验收口径或不在本期范围内的事项……'
                : '例如：必须兼容旧接口；本次只调整报价模块；数据库变更需要支持灰度发布……'}
              className="mt-2 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm leading-6 outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.pdf,.docx,.doc,image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={event => void handleFiles(event.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:border-[var(--color-primary)] disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              {uploading ? '正在上传并解析…' : '添加附件或截图'}
            </button>
            <p className="mt-1.5 text-[10px] text-[var(--color-muted-foreground)]">支持 PDF、Word、Markdown、文本和常用图片，可多选。</p>
          </div>

          {(attachments.length > 0 || images.length > 0) && (
            <div className="space-y-2">
              {attachments.map((attachment, index) => (
                <div key={`${attachment.fileId}-${index}`} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/25 px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate text-xs">{attachment.fileName}</span>
                  <button type="button" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))} className="p-1 text-[var(--color-muted-foreground)] hover:text-rose-500" aria-label={`移除 ${attachment.fileName}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {images.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/25 px-3 py-2">
                  <ImageIcon className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate text-xs">{item.name || `补充截图 ${index + 1}`}</span>
                  <button type="button" onClick={() => setImages(current => current.filter(image => image.id !== item.id))} className="p-1 text-[var(--color-muted-foreground)] hover:text-rose-500" aria-label={`移除 ${item.name}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:px-5">
          <button type="button" onClick={onClose} disabled={uploading} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs disabled:opacity-50">返回修改答案</button>
          <button type="button" onClick={confirm} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" />确认并生成 {kind}
          </button>
        </footer>
      </section>
    </div>
  )
}

