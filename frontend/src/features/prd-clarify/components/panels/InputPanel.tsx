import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  BriefcaseBusiness,
  ChevronDown,
  Code2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import { SystemModuleSelector } from '@/components/prd/SystemModuleSelector'
import { splitCatalogValues } from '@/lib/systemCatalog'
import {
  parseAttachment,
  saveDraft,
  updateDraft,
  uploadImageAttachment,
  type AttachmentParseResult,
} from '../../api'
import type { PrdClarifyMode, PrdReqType } from '../../types'
import { buildFinalRawInput } from '../../lib/inputDocument'
import type { ClarifyEngine } from '../dialogs/StartClarifyDialog'
import { ImageLightbox } from '../ImageLightbox'

// ───── 需求类型配置：与角色正交，决定探索重点和规格结构 ─────

/** 常用预设提示词：点击直接追加到文本框（换行分隔），用户也可以完全自由输入。 */

// ───── 角色配置 ─────
const ROLE_CONFIG = {
  PRODUCT: {
    label: '产品视角',
    desc: '探索设计细节、技术约束和边界条件',
    placeholder: '比如：供应商报价的操作太复杂，希望手机上能更快完成报价……',
  },
  BUSINESS: {
    label: '业务视角',
    desc: '聚焦业务结果，弱化技术和界面细节',
    placeholder: '比如：每天核对报价很费时间，希望系统能自动找出异常价格……',
  },
} as const

// ───── 表单（Step INPUT） ─────
export function InputPanel({
  onStart,
  initialTitle = '',
  initialRawInput = '',
  initialProject = '',
  initialModule = '',
  draftId = null,
  onDraftSaved,
}: {
  // reqType 可选：业务员角色不需要判断技术分类，省略后交给后端按需求内容判定。
  // draftId 非空时复用现存 DRAFT 会话，而不是重复创建。
  onStart: (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS', reqType?: PrdReqType, maxQuestions?: number, clarifyMode?: PrdClarifyMode, draftId?: string, engine?: ClarifyEngine) => void
  initialTitle?: string
  initialRawInput?: string
  initialProject?: string
  initialModule?: string
  /** 恢复草稿时传入草稿会话 id；全新填写（未保存过草稿）时为 null。 */
  draftId?: string | null
  /** 首次保存草稿成功后回调新生成的 id，父组件据此把 sessionId 状态同步过来，
   *  后续再点「保存草稿」/「开始探索」时才知道要原地更新而不是重复创建。 */
  onDraftSaved?: (id: string) => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [rawInput, setRawInput] = useState(initialRawInput)
  const [project, setProject] = useState(initialProject)
  // 多系统仍使用历史逗号分隔字段持久化，并约定首项是主系统，无需修改存量 schema。
  const [primaryProject, setPrimaryProject] = useState(splitCatalogValues(initialProject)[0] ?? '')
  const [module, setModule] = useState(initialModule)
  const [role, setRole] = useState<'PRODUCT' | 'BUSINESS'>('PRODUCT')
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const [engine, setEngine] = useState<ClarifyEngine>('claude')
  const [startSubmitted, setStartSubmitted] = useState(false)
  const startSubmittedRef = useRef(false)
  const [moreContextOpen, setMoreContextOpen] = useState(Boolean(initialTitle || initialProject || initialModule))
  /** 已上传并解析的附件列表 */
  const [attachments, setAttachments] = useState<AttachmentParseResult[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── 直接粘贴图片：边写内容边 Ctrl+V，图片以 Markdown 语法插进光标处，随文字一起构成
  // rawInput（跟上面"上传附件"提取文本后追加到末尾是两种不同机制，见 handlePasteImage 注释）
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [pastedImages, setPastedImages] = useState<{ id: string; name: string; url: string; token: string }[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null)
  /** 图片序号计数器，用 ref 而非 state.length 避免连续快速粘贴时读到未更新的旧值。 */
  const imageCounterRef = useRef(0)

  // 当外部初始值变化时（如从 showcase 跳转带参数）同步更新
  useEffect(() => { if (initialTitle) setTitle(initialTitle) }, [initialTitle])
  useEffect(() => { if (initialRawInput) setRawInput(initialRawInput) }, [initialRawInput])
  useEffect(() => {
    if (!initialProject) return
    setProject(initialProject)
    setPrimaryProject(splitCatalogValues(initialProject)[0] ?? '')
  }, [initialProject])
  useEffect(() => { if (initialModule) setModule(initialModule) }, [initialModule])
  useEffect(() => {
    if (initialTitle || initialProject || initialModule) setMoreContextOpen(true)
  }, [initialTitle, initialProject, initialModule])

  /**
   * 恢复草稿时，rawInput 里可能已经嵌了之前粘贴过的 `![粘贴图片N](url)` 图片链接
   * （见 handlePasteImage）——图片本身落盘在后端、url 长期有效，只是 pastedImages
   * 缩略图条是纯前端 state，不会跟着 initialRawInput 自动重建，不然文本域里就只剩
   * 一串裸的 markdown 语法、看不出是图片。这里从 initialRawInput 里把它们解析回来，
   * 顺便把序号计数器对齐，避免恢复草稿后继续粘贴新图片时序号从 1 重新撞车。
   */
  useEffect(() => {
    if (!initialRawInput) return
    const regex = /!\[粘贴图片(\d+)\]\((\/api\/prd-clarify\/attachments\/image\/[^)]+)\)/g
    const found: { id: string; name: string; url: string; token: string }[] = []
    let maxN = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(initialRawInput))) {
      const n = Number(m[1])
      const url = m[2]
      maxN = Math.max(maxN, n)
      found.push({ id: url.split('/').pop() ?? url, name: `粘贴图片${n}`, url, token: m[0] })
    }
    if (found.length > 0) {
      setPastedImages(found)
      imageCounterRef.current = Math.max(imageCounterRef.current, maxN)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRawInput])

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploadingFile(true)
    try {
      const results = await Promise.all(
        Array.from(files).map(f => parseAttachment(f))
      )
      setAttachments(prev => [...prev, ...results])
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '文件解析失败')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * 直接粘贴图片：只拦截剪贴板里含图片文件的粘贴（e.clipboardData.files 命中 image/* 才
   * preventDefault，纯文本粘贴不受影响，走浏览器默认行为）。上传落盘后把
   * `![粘贴图片N](url)` 插入到当前光标位置（有选区则替换选区，对齐正常粘贴语义），
   * 插入后把光标移到插入内容之后方便继续打字。多图一次粘贴时并行上传、一次性插入，
   * 避免逐张 setState 导致后一张覆盖前一张的插入位置。
   */
  const handlePasteImage = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? rawInput.length
    const end = textarea?.selectionEnd ?? rawInput.length
    setUploadingImage(true)
    setImageUploadError(null)
    try {
      const uploaded = await Promise.all(files.map(f => uploadImageAttachment(f)))
      const newEntries = uploaded.map((att) => {
        imageCounterRef.current += 1
        return { id: att.id, name: att.name, url: att.url, token: `![粘贴图片${imageCounterRef.current}](${att.url})` }
      })
      const insertText = newEntries.map(entry => entry.token).join('\n') + '\n'
      setRawInput(prev => prev.slice(0, start) + insertText + prev.slice(end))
      setPastedImages(prev => [...prev, ...newEntries])
      requestAnimationFrame(() => {
        if (textarea) {
          const newPos = start + insertText.length
          textarea.focus()
          textarea.setSelectionRange(newPos, newPos)
        }
      })
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : '图片上传失败')
    } finally {
      setUploadingImage(false)
    }
  }

  /** 移除一张已粘贴的图片：连同插入文本域里的 Markdown 语法一起清掉。 */
  const removePastedImage = (entry: { id: string; token: string }) => {
    setRawInput(prev => prev.replace(entry.token + '\n', '').replace(entry.token, ''))
    setPastedImages(prev => prev.filter(p => p.id !== entry.id))
  }

  /**
   * 保存草稿：只需要标题，不触发任何 AI 调用（不判定需求类型/不澄清）。首次保存新建一条
   * DRAFT 记录，之后（draftId 已知）再保存就原地覆盖，不会越存越多条。
   */
  const suggestedTitle = createSuggestedTitle(title, rawInput, attachments)

  const saveDraftMut = useMutation({
    mutationFn: () => {
      const payload = { title: suggestedTitle, rawInput: buildFinalRawInput(rawInput, attachments), project, module }
      return draftId ? updateDraft(draftId, payload) : saveDraft(payload)
    },
    onSuccess: (session) => {
      setDraftSavedAt(Date.now())
      if (!draftId) onDraftSaved?.(session.id)
    },
  })

  const projectTags = splitCatalogValues(project)
  const moduleTags = splitCatalogValues(module)

  const canSubmit = Boolean(rawInput.trim() || attachments.length > 0)

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-5 py-8 md:px-12 md:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--color-primary)]">
            <Sparkles className="h-4 w-4" />
            Forge Discovery
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">今天想解决什么？</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">
            一个问题、一个想法，或者一张截图都可以。不需要预先整理文档，Forge 会探索现有系统并形成初始化规格。
          </p>
        </header>

        <section className="overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card)] focus-within:border-[var(--color-primary)]/55 focus-within:ring-2 focus-within:ring-[var(--color-primary)]/10">
          <textarea
            ref={textareaRef}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onPaste={handlePasteImage}
            rows={8}
            aria-label="描述想探索的问题或想法"
            placeholder={`${ROLE_CONFIG[role].placeholder}\n\n可以直接 Ctrl+V 粘贴截图或图片。`}
            className="min-h-52 w-full resize-y bg-transparent px-5 py-4 text-[15px] leading-7 outline-none placeholder:text-[var(--color-muted-foreground)]/70"
          />

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-3 py-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
              title="上传 Markdown、PDF、Word 或 Excel 文件"
            >
              {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {uploadingFile ? '解析中' : '添加附件'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.pdf,.docx,.doc,.xlsx,.xls"
              multiple
              className="hidden"
              onChange={(event) => handleFileUpload(event.target.files)}
            />

            <div className="flex h-9 items-center rounded-lg bg-[var(--color-muted)]/55 p-1" aria-label="探索视角">
              {(['PRODUCT', 'BUSINESS'] as const).map((value) => {
                const active = role === value
                const Icon = value === 'PRODUCT' ? Code2 : BriefcaseBusiness
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    aria-pressed={active}
                    title={ROLE_CONFIG[value].desc}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
                      active
                        ? 'bg-[var(--color-card)] font-medium text-[var(--color-foreground)]'
                        : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {ROLE_CONFIG[value].label}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              disabled={!canSubmit || startSubmitted}
              onClick={() => {
                if (startSubmittedRef.current) return
                startSubmittedRef.current = true
                setStartSubmitted(true)
                onStart(
                  suggestedTitle,
                  buildFinalRawInput(rawInput, attachments),
                  project,
                  module,
                  role,
                  undefined,
                  undefined,
                  undefined,
                  draftId ?? undefined,
                  engine,
                )
              }}
              className="ml-auto inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              {startSubmitted ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {startSubmitted ? '正在创建探索…' : '开始探索'}
            </button>
          </div>
        </section>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-muted-foreground)]">
          <span>Forge 将优先查询模块知识、代码图谱、页面路由和关键 DDL。</span>
          <button
            type="button"
            disabled={!canSubmit || saveDraftMut.isPending}
            onClick={() => saveDraftMut.mutate()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-[var(--color-muted)]/50 hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
          >
            {saveDraftMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存为草稿
          </button>
        </div>

        {uploadError && <p className="mt-3 text-xs text-red-500">{uploadError}</p>}
        {imageUploadError && <p className="mt-3 text-xs text-red-500">{imageUploadError}</p>}

          {/* 已粘贴的图片：缩略图条，跟文本域里插入的 ![粘贴图片N](url) 一一对应，
              点 × 连同文本域里的 Markdown 语法一起移除 */}
          {(pastedImages.length > 0 || uploadingImage) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {pastedImages.map((img) => (
                <div key={img.id} className="relative group flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreviewImage({ src: img.url, alt: img.name })}
                    className="block cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                    title={`预览 ${img.name}`}
                    aria-label={`预览图片 ${img.name}`}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-14 h-14 object-cover rounded-lg border border-[var(--color-border)]"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePastedImage(img)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移除这张图片"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {uploadingImage && (
                <div className="w-14 h-14 rounded-lg border border-dashed border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--color-muted-foreground)]" />
                </div>
              )}
              <span className="text-[11px] text-[var(--color-muted-foreground)] flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                {uploadingImage ? '上传中…' : `已粘贴 ${pastedImages.length} 张图片`}
              </span>
            </div>
          )}

          {previewImage && (
            <ImageLightbox
              src={previewImage.src}
              alt={previewImage.alt}
              onClose={() => setPreviewImage(null)}
            />
          )}

        {attachments.length > 0 && (
          <div className="mt-4 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-primary)]" />
                  <span className="text-xs font-medium truncate flex-1">{att.fileName}</span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">
                    {(att.text.length / 1000).toFixed(1)}k 字{att.truncated ? '（已截断）' : ''}
                  </span>
                  {/* 原始文件已落盘，随时可以下载查看（不止是抽取出来的纯文本） */}
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
                    title="下载原始文件"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="text-[var(--color-muted-foreground)] hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
          </div>
        )}

        <details
          className="group mt-8 border-t border-[var(--color-border)] pt-5"
          open={moreContextOpen}
          onToggle={(event) => setMoreContextOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            提供更多上下文
            <span className="text-xs font-normal">可选，Forge 会自动识别</span>
          </summary>
          <div className="mt-5 space-y-5 border-l border-[var(--color-border)] pl-5">
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <label className="text-xs font-medium">
                <span className="mb-1.5 block">需求标题</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={`自动使用“${suggestedTitle}”`}
                  className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm outline-none transition-colors placeholder:text-[var(--color-muted-foreground)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10"
                />
              </label>
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium">执行引擎</legend>
                <div className="grid grid-cols-2 rounded-lg bg-[var(--color-muted)]/55 p-1">
                  {(['claude', 'codex'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEngine(value)}
                      aria-pressed={engine === value}
                      className={`h-7 rounded-md text-xs capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${
                        engine === value ? 'bg-[var(--color-card)] font-medium' : 'text-[var(--color-muted-foreground)]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <SystemModuleSelector
              className="[&_[role=combobox]]:bg-[var(--color-card)] [&_[role=combobox]]:transition-colors [&_[role=combobox]]:hover:border-[var(--color-border-strong)]"
              systems={projectTags}
              modules={moduleTags}
              primarySystem={primaryProject}
              onSystemsChange={(systems, primarySystem) => {
                setProject(systems.join(', '))
                setPrimaryProject(primarySystem)
              }}
              onModulesChange={(modules) => setModule(modules.join(', '))}
            />
          </div>
        </details>

        {draftSavedAt && (
          <p className="mt-3 text-right text-[11px] text-[var(--color-muted-foreground)]">
            草稿已保存 · {new Date(draftSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {saveDraftMut.isError && (
          <p className="mt-3 text-right text-[11px] text-red-500">
            草稿保存失败：{saveDraftMut.error instanceof Error ? saveDraftMut.error.message : '未知错误'}
          </p>
        )}
      </div>
    </main>
  )
}

function createSuggestedTitle(title: string, rawInput: string, attachments: AttachmentParseResult[]) {
  if (title.trim()) return title.trim()
  const firstLine = rawInput.split(/\r?\n/).map(line => line.trim()).find(Boolean)
  if (firstLine) return firstLine.replace(/^#+\s*/, '').slice(0, 40)
  if (attachments[0]?.fileName) return attachments[0].fileName.replace(/\.[^.]+$/, '').slice(0, 40)
  return '未命名需求探索'
}

// ───── 生成阶段流式展示（含失败重试 UI） ─────
