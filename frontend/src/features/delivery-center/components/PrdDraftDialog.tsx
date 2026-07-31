import { useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, Paperclip, Sparkles, X } from 'lucide-react'
import { SystemModuleSelector } from '@/components/prd/SystemModuleSelector'
import {
  parsePrdAttachment,
  uploadPrdImage,
  type PrdAttachmentParseResult,
  type PrdImageAttachmentResult,
} from '@/lib/prdAttachments'
import { splitCatalogValues } from '@/lib/systemCatalog'
import type { PrdBusinessFields } from '@/features/prd-clarify/types'
import { createPrdDraft, suggestPrdTitle } from '../api'

interface PrdDraftDialogProps {
  initialProject: string
  initialShortTitle?: string
  initialDescription?: string
  initialBusinessFields?: PrdBusinessFields
  onClose: () => void
  onCreated: (sessionId: string) => void
}

/** AI 交付中心的 PRD 起草入口，创建后把生命周期交回 PRD 澄清模块。 */
export function PrdDraftDialog({
  initialProject,
  initialShortTitle = '',
  initialDescription = '',
  initialBusinessFields = {},
  onClose,
  onCreated,
}: PrdDraftDialogProps) {
  const [systems, setSystems] = useState(() => splitCatalogValues(initialProject))
  const [primarySystem, setPrimarySystem] = useState(() => splitCatalogValues(initialProject)[0] ?? '')
  const [modules, setModules] = useState<string[]>([])
  const [shortTitle, setShortTitle] = useState(() => initialShortTitle.slice(0, 40))
  const [description, setDescription] = useState(
    initialBusinessFields.requirementDetail ?? initialDescription,
  )
  const [businessBackground, setBusinessBackground] = useState(initialBusinessFields.businessBackground ?? '')
  const [businessRequirementType, setBusinessRequirementType] = useState(initialBusinessFields.businessRequirementType ?? '')
  const [requirementSoftware, setRequirementSoftware] = useState(initialBusinessFields.requirementSoftware ?? '')
  const [initiatingDepartment, setInitiatingDepartment] = useState(initialBusinessFields.initiatingDepartment ?? '')
  const [requester, setRequester] = useState(initialBusinessFields.requester ?? '')
  const [requestedAt, setRequestedAt] = useState(initialBusinessFields.requestedAt ?? '')
  const [sourceAttachments, setSourceAttachments] = useState(initialBusinessFields.attachments ?? '')
  const [followUpRecords, setFollowUpRecords] = useState(initialBusinessFields.followUpRecords ?? '')
  const [attachments, setAttachments] = useState<PrdAttachmentParseResult[]>([])
  const [images, setImages] = useState<Array<PrdImageAttachmentResult & { token: string }>>([])
  const [busy, setBusy] = useState<'title' | 'create' | 'file' | 'image' | null>(null)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageCounterRef = useRef(0)

  const moduleTitle = summarizeModules(modules)
  const title = [primarySystem.trim(), moduleTitle, shortTitle.trim()].filter(Boolean).join('-')
  const rawInput = buildRawInput({
    description,
    businessBackground,
    businessRequirementType,
    requirementSoftware,
    initiatingDepartment,
    requester,
    requestedAt,
    sourceAttachments,
    followUpRecords,
    attachments,
  })
  const canGenerate = systems.length > 0
    && primarySystem.trim()
    && modules.length > 0
    && description.trim()
    && !busy
  const canCreate = canGenerate && shortTitle.trim()

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy('file')
    setError('')
    try {
      const parsed = await Promise.all(Array.from(files).map(parsePrdAttachment))
      setAttachments(current => [...current, ...parsed])
    } catch (cause) {
      setError(messageOf(cause, '附件解析失败'))
    } finally {
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    const start = textareaRef.current?.selectionStart ?? description.length
    const end = textareaRef.current?.selectionEnd ?? description.length
    setBusy('image')
    setError('')
    try {
      const uploaded = await Promise.all(files.map(uploadPrdImage))
      const entries = uploaded.map(image => {
        imageCounterRef.current += 1
        return { ...image, token: `![粘贴图片${imageCounterRef.current}](${image.url})` }
      })
      const inserted = `${entries.map(item => item.token).join('\n')}\n`
      setDescription(current => current.slice(0, start) + inserted + current.slice(end))
      setImages(current => [...current, ...entries])
      requestAnimationFrame(() => {
        const position = start + inserted.length
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(position, position)
      })
    } catch (cause) {
      setError(messageOf(cause, '图片上传失败'))
    } finally {
      setBusy(null)
    }
  }

  const handleSuggestTitle = async () => {
    setBusy('title')
    setError('')
    try {
      const suggestion = await suggestPrdTitle(primarySystem.trim(), moduleTitle, rawInput)
      setShortTitle(suggestion.shortTitle)
    } catch (cause) {
      setError(messageOf(cause, '标题生成失败'))
    } finally {
      setBusy(null)
    }
  }

  const handleCreate = async () => {
    setBusy('create')
    setError('')
    try {
      const session = await createPrdDraft({
        title,
        rawInput,
        project: systems.join(', '),
        module: modules.join(', '),
        businessFields: {
          requirementDetail: description.trim(),
          businessBackground: businessBackground.trim(),
          businessRequirementType: businessRequirementType.trim(),
          requirementSoftware: requirementSoftware.trim(),
          initiatingDepartment: initiatingDepartment.trim(),
          requester: requester.trim(),
          requestedAt: requestedAt.trim(),
          attachments: buildAttachmentField(sourceAttachments, attachments),
          followUpRecords: followUpRecords.trim(),
        },
      })
      onCreated(session.id)
    } catch (cause) {
      setError(messageOf(cause, 'PRD 会话创建失败'))
      setBusy(null)
    }
  }

  const removeImage = (image: PrdImageAttachmentResult & { token: string }) => {
    setDescription(current => current.replace(`${image.token}\n`, '').replace(image.token, ''))
    setImages(current => current.filter(item => item.id !== image.id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="prd-draft-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">PRD Drafting</p>
            <h2 id="prd-draft-title" className="mt-1 text-base font-semibold">起草 PRD</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">描述真实需求，AI 只负责提炼标题，后续进入标准澄清链路。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <SystemModuleSelector
            systems={systems}
            modules={modules}
            primarySystem={primarySystem}
            onSystemsChange={(nextSystems, nextPrimarySystem) => {
              setSystems(nextSystems)
              setPrimarySystem(nextPrimarySystem)
            }}
            onModulesChange={setModules}
            required
          />

          <Field label="需求标题" required>
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center border border-[var(--color-border)] bg-[var(--color-input)]">
                <span className="shrink-0 border-r border-[var(--color-border)] px-3 text-xs text-[var(--color-muted-foreground)]">
                  {primarySystem.trim() || '主系统'}-{moduleTitle || '模块'}-
                </span>
                <input
                  value={shortTitle}
                  maxLength={40}
                  onChange={event => setShortTitle(event.target.value)}
                  placeholder="业务短标题"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                />
              </div>
              <button
                type="button"
                disabled={!canGenerate}
                onClick={handleSuggestTitle}
                className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--color-primary)]/40 px-3 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-40"
              >
                {busy === 'title' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI 定义标题
              </button>
            </div>
            {shortTitle.trim() && <p className="mt-1.5 text-[10px] text-[var(--color-muted-foreground)]">最终标题：{title}</p>}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="需求类型">
              <input
                value={businessRequirementType}
                onChange={event => setBusinessRequirementType(event.target.value)}
                list="prd-business-requirement-types"
                placeholder="新需求 / 功能优化 / 系统缺陷"
                className={inputClass}
              />
              <datalist id="prd-business-requirement-types">
                <option value="新需求" />
                <option value="功能优化" />
                <option value="系统缺陷" />
                <option value="数据异常" />
              </datalist>
            </Field>
            <Field label="需求软件">
              <input
                value={requirementSoftware}
                onChange={event => setRequirementSoftware(event.target.value)}
                placeholder="ERP / SRM / 自研系统"
                className={inputClass}
              />
            </Field>
            <Field label="发起部门">
              <input
                value={initiatingDepartment}
                onChange={event => setInitiatingDepartment(event.target.value)}
                placeholder="需求发起部门"
                className={inputClass}
              />
            </Field>
            <Field label="提出人">
              <input
                value={requester}
                onChange={event => setRequester(event.target.value)}
                placeholder="需求提出人"
                className={inputClass}
              />
            </Field>
            <Field label="提出日期">
              <input
                type="date"
                value={requestedAt}
                onChange={event => setRequestedAt(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="需求背景 / 业务痛点">
            <textarea
              value={businessBackground}
              onChange={event => setBusinessBackground(event.target.value)}
              rows={4}
              placeholder="说明当前业务现状、问题和影响。"
              className={`${inputClass} resize-y`}
            />
          </Field>

          <Field label="需求详情" required>
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] disabled:opacity-40"
              >
                {busy === 'file' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                上传附件
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.pdf,.docx,.doc"
                multiple
                className="hidden"
                onChange={event => handleFiles(event.target.files)}
              />
            </div>
            <textarea
              ref={textareaRef}
              value={description}
              onChange={event => setDescription(event.target.value)}
              onPaste={handlePaste}
              rows={8}
              placeholder="说明业务目标、期望流程、业务规则和验收标准；可直接 Ctrl+V 粘贴截图。"
              className={`${inputClass} resize-y`}
            />
          </Field>

          <Field label="跟进记录">
            <textarea
              value={followUpRecords}
              onChange={event => setFollowUpRecords(event.target.value)}
              rows={4}
              placeholder="记录补充反馈、处理进展和待确认事项。"
              className={`${inputClass} resize-y`}
            />
          </Field>

          <Field label="来源附件">
            <textarea
              value={sourceAttachments}
              onChange={event => setSourceAttachments(event.target.value)}
              rows={2}
              placeholder="从需求池导入的附件名称或链接；本页上传的新附件也会自动写入数据对象。"
              className={`${inputClass} resize-y`}
            />
          </Field>

          {(images.length > 0 || busy === 'image') && (
            <div className="flex flex-wrap items-center gap-2">
              {images.map(image => (
                <div key={image.id} className="group relative">
                  <img src={image.url} alt={image.name} className="h-14 w-14 border border-[var(--color-border)] object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(image)}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]">
                {busy === 'image' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                {busy === 'image' ? '图片上传中…' : `${images.length} 张图片已加入描述`}
              </span>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              {attachments.map((attachment, index) => (
                <div key={`${attachment.fileId}-${index}`} className="flex items-center gap-2 py-2 text-xs">
                  <FileText className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">{(attachment.text.length / 1000).toFixed(1)}k 字</span>
                  <button type="button" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <X className="h-3 w-3 text-[var(--color-muted-foreground)]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-5 py-4">
          <button type="button" onClick={onClose} disabled={!!busy} className="px-4 py-2 text-xs text-[var(--color-muted-foreground)]">取消</button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy === 'create' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            创建并开始澄清
          </button>
        </footer>
      </section>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium">
      <span className="mb-1.5 block">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>
      {children}
    </label>
  )
}

function buildRawInput({
  description,
  businessBackground,
  businessRequirementType,
  requirementSoftware,
  initiatingDepartment,
  requester,
  requestedAt,
  sourceAttachments,
  followUpRecords,
  attachments,
}: {
  description: string
  businessBackground: string
  businessRequirementType: string
  requirementSoftware: string
  initiatingDepartment: string
  requester: string
  requestedAt: string
  sourceAttachments: string
  followUpRecords: string
  attachments: PrdAttachmentParseResult[]
}) {
  const attributes = [
    businessRequirementType.trim() && `- 需求类型：${businessRequirementType.trim()}`,
    requirementSoftware.trim() && `- 需求软件：${requirementSoftware.trim()}`,
    initiatingDepartment.trim() && `- 发起部门：${initiatingDepartment.trim()}`,
    requester.trim() && `- 提出人：${requester.trim()}`,
    requestedAt.trim() && `- 提出日期：${requestedAt.trim()}`,
  ].filter(Boolean)
  const sections = [
    attributes.length > 0 && `## 业务属性\n${attributes.join('\n')}`,
    businessBackground.trim() && `## 需求背景 / 业务痛点\n${businessBackground.trim()}`,
    description.trim() && `## 需求详情\n${description.trim()}`,
    sourceAttachments.trim() && `## 来源附件\n${sourceAttachments.trim()}`,
    followUpRecords.trim() && `## 跟进记录\n${followUpRecords.trim()}`,
  ].filter(Boolean)
  const base = sections.join('\n\n')
  if (attachments.length === 0) return base
  const appendix = attachments.map(attachment =>
    `[📎 附件：${attachment.fileName}](${attachment.url})\n---\n【附件：${attachment.fileName}】\n${attachment.text}${attachment.truncated ? '\n（内容已截断）' : ''}\n---`
  ).join('\n\n')
  return `${base}\n\n${appendix}`.trim()
}

function buildAttachmentField(source: string, attachments: PrdAttachmentParseResult[]) {
  const uploaded = attachments.map(attachment => `[${attachment.fileName}](${attachment.url})`)
  return [source.trim(), ...uploaded].filter(Boolean).join('\n')
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback
}

function summarizeModules(modules: string[]) {
  const combined = modules.join('+')
  return combined.length <= 60 ? combined : `${modules[0]}+等${modules.length}个模块`
}

const inputClass = 'w-full border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-sm outline-none focus:border-[var(--color-ring)]'
