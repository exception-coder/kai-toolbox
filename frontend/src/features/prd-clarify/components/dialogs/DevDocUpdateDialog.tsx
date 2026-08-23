import { useRef, useState } from 'react'
import { ExternalLink, FileText, Loader2, Paperclip, Wrench, X } from 'lucide-react'
import { parseAttachment, type AttachmentParseResult, type QaPair } from '../../api'
import type { ClarifyEngine } from './StartClarifyDialog'

const DEV_DOC_PROMPT_PRESETS = [
  '重点关注可维护性和代码复用，优先复用现有工具类/组件',
  '性能优先，标注关键索引/缓存点',
  '给出详细到方法级别的实现步骤',
  '参考现有代码风格保持一致，不引入新的第三方库',
  '重点设计好数据库表结构和字段类型',
] as const

/** 执行计划生成入口；未决技术事项写入文档，不再启动逐题技术澄清。 */
export function DevDocUpdateDialog({
  mode,
  initialEngine,
  onConfirm,
  onClose,
}: {
  mode: 'initial' | 'update'
  initialEngine: ClarifyEngine
  onConfirm: (extraInstructions: string, qaHistory: QaPair[], engine: ClarifyEngine) => void
  onClose: () => void
}) {
  const isUpdate = mode === 'update'
  const [engine, setEngine] = useState<ClarifyEngine>(initialEngine)
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<AttachmentParseResult[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploadError(null)
    setUploadingFile(true)
    try {
      const results = await Promise.all(Array.from(files).map(file => parseAttachment(file)))
      setAttachments(current => [...current, ...results])
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : '文件解析失败')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const buildInstructions = () => {
    const attachmentContext = attachments.map(attachment =>
      `[附件：${attachment.fileName}](${attachment.url})\n---\n${attachment.text}${attachment.truncated ? '\n（内容已截断）' : ''}\n---`,
    ).join('\n\n')
    return [notes.trim(), attachmentContext].filter(Boolean).join('\n\n')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl">
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wrench className="h-4 w-4 text-purple-400" />
            {isUpdate ? '更新执行计划' : '生成执行计划'}
          </h3>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">
            Forge 将结合核心规格、代码图谱和项目上下文直接生成完整执行计划。无法确认且会影响实现的技术决策会写入文档的“待确认技术事项”，不会中途逐题提问。
          </p>

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="text-xs font-medium">{isUpdate ? '本次更新说明' : '开发约束或偏好（可选）'}</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-ring)] hover:text-[var(--color-foreground)] disabled:opacity-50"
              >
                {uploadingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                {uploadingFile ? '解析中…' : '添加附件'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.pdf,.docx,.doc,.xlsx,.xls"
                multiple
                className="hidden"
                onChange={event => void handleFileUpload(event.target.files)}
              />
            </div>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={4}
              placeholder={isUpdate
                ? '如：新增退款审批环节、调整订单查询接口入参……'
                : '如：必须兼容旧接口、不能新增中间件、数据迁移需无停机……'}
              className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
            {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
          </section>

          {attachments.length > 0 && (
            <section className="space-y-1.5">
              {attachments.map((attachment, index) => (
                <div key={`${attachment.fileName}-${index}`} className="flex items-center gap-2 border-b border-[var(--color-border)] px-1 py-2 last:border-b-0">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate text-xs">{attachment.fileName}</span>
                  <a href={attachment.url} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${attachment.fileName}`} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button type="button" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${attachment.fileName}`} className="text-[var(--color-muted-foreground)] hover:text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </section>
          )}

          {!isUpdate && (
            <section>
              <div className="mb-1.5 text-[11px] text-[var(--color-muted-foreground)]">常用约束</div>
              <div className="flex flex-wrap gap-1.5">
                {DEV_DOC_PROMPT_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNotes(current => current.trim() ? `${current.trim()}\n${preset}` : preset)}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-left text-[11px] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-ring)] hover:text-[var(--color-foreground)]"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-1.5 text-[11px] text-[var(--color-muted-foreground)]">执行引擎</div>
            <div className="grid grid-cols-2 gap-2">
              {(['claude', 'codex'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEngine(value)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${engine === value
                    ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'}`}
                >
                  {value === 'claude' ? 'Claude Code' : 'Codex'}
                </button>
              ))}
            </div>
          </section>

          <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]/30">取消</button>
            <button type="button" onClick={() => onConfirm(buildInstructions(), [], engine)} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
              后台生成执行计划
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
