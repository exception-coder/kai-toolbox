import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Code2, ExternalLink, FileText, Image as ImageIcon, Layers, Loader2, Paperclip, Save, X } from 'lucide-react'
import { SystemModuleSelector } from '@/components/prd/SystemModuleSelector'
import { splitCatalogValues } from '@/lib/systemCatalog'
import {
  parseAttachment,
  saveDraft,
  updateDraft,
  uploadImageAttachment,
  type AttachmentParseResult,
} from '../../api'
import type { DocumentProfile, PrdClarifyMode, PrdReqType } from '../../types'
import { buildFinalRawInput } from '../../lib/inputDocument'
import { StartClarifyDialog, type ClarifyEngine } from '../dialogs/StartClarifyDialog'

const QUICK_TEMPLATES = [
  {
    label: 'SLA 预警',
    hint: '知识图谱示例',
    title: '需求池 SLA 剩余天数预警',
    project: 'kai-toolbox',
    module: '需求管理池',
    rawInput: `当需求池中的需求接近截止日期时，系统没有任何提醒机制，
导致产品经理经常遗忘，需求超期后才发现。

期望功能：
- 在需求列表中，距截止日期 ≤3 天的需求自动标红高亮（行级变色）
- 距截止日期 ≤7 天显示黄色警告图标
- 在页面顶部增加"即将超期 N 条"的摘要提示条
- 已完成（DONE）和已取消（CANCELLED）的需求不参与预警
- 超期阈值可在设置中调整（默认 3 天和 7 天）`,
  },
  {
    label: '批量操作',
    hint: '业务逻辑澄清示例',
    title: '需求批量状态变更与分配',
    project: 'kai-toolbox',
    module: '需求管理池',
    rawInput: `产品经理每周会对一批需求做统一操作：
- 将本迭代完成的需求批量标记为 DONE
- 将下迭代的需求批量指派给同一个开发人员
- 将废弃的需求批量取消（状态改为 CANCELLED）

目前只能逐条点击操作，每次迭代结束要手动操作几十条，非常耗时。

期望效果：需求列表支持多选（勾选框），然后可以批量改状态或批量改负责人。`,
  },
  {
    label: '导入Excel',
    hint: '综合示例',
    title: '需求数据导入（Excel/CSV）',
    project: 'kai-toolbox',
    module: '需求管理池',
    rawInput: `我们团队在使用需求管理池之前，已有数百条需求记录存在 Excel 表格中，
列名包括：需求名称、描述、项目、模块、优先级、负责人、截止日期。

期望功能：
1. 支持上传 .xlsx 或 .csv 文件
2. 提供标准导入模板（可下载）
3. 导入前预览：展示将导入的行数、字段映射结果
4. 导入后生成结果报告（成功 N 条/失败 N 条/跳过 N 条）
5. 重复检测：标题完全相同的需求自动跳过（不重复导入）`,
  },
]

// ───── 需求类型配置：与角色正交的第二个维度，决定问什么 + 产出什么结构的文档 + 默认澄清深度 ─────

/** 澄清深度预设档位（轮数），点选后自定义数字框会同步；用户改数字框后不再随类型自动跳档 */

/** 常用预设提示词：点击直接追加到文本框（换行分隔），用户也可以完全自由输入。 */

// ───── 角色配置 ─────
const ROLE_CONFIG = {
  PRODUCT: {
    label: '产品 / 开发',
    badge: '专业模式',
    desc: '会问设计细节、技术约束、边界条件',
    placeholder: '描述需求的背景、期望功能、约束条件等，越详细越好。Claude 会根据你的描述提出专业的澄清问题。',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/30',
  },
  BUSINESS: {
    label: '业务员',
    badge: '业务模式',
    desc: '只问影响业务结果的关键问题，跳过技术/界面细节',
    placeholder: '用你自己的语言描述：你在工作中遇到了什么问题？你希望系统能帮你做什么？不用担心技术细节，写清楚业务场景就好。',
    color: 'text-green-500',
    bg: 'bg-green-500/10 border-green-500/30',
  },
} as const

// ───── 表单（Step INPUT） ─────
export function InputPanel({
  onStart,
  onStartVibe,
  initialTitle = '',
  initialRawInput = '',
  initialProject = '',
  initialModule = '',
  initialDocumentProfile = 'CLASSIC',
  draftId = null,
  onDraftSaved,
  onSplit,
}: {
  // reqType/maxQuestions 可选：业务员角色的确认框不问技术分类和轮数，省略这两个参数，
  // 交给后端 LLM 自动判定（见 handleStart/handleStartVibe 里对应处理）。clarifyMode 只有
  // onStart（内嵌澄清）有意义，Vibe Coding 入口省略，由 createSession 兜底成 progressive。
  // draftId：非空时表示 onStart/onStartVibe 应该把现存的这条 DRAFT 会话原地转正式
  // （startClarifyFromDraft），而不是新建一条记录——由 handleStart/handleStartVibe 判断。
  onStart: (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS', reqType?: PrdReqType, maxQuestions?: number, clarifyMode?: PrdClarifyMode, draftId?: string, engine?: ClarifyEngine, documentProfile?: DocumentProfile) => void
  onStartVibe: (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS', reqType?: PrdReqType, maxQuestions?: number, draftId?: string, engine?: ClarifyEngine, documentProfile?: DocumentProfile) => void
  initialTitle?: string
  initialRawInput?: string
  initialProject?: string
  initialModule?: string
  initialDocumentProfile?: DocumentProfile
  /** 恢复草稿时传入草稿会话 id；全新填写（未保存过草稿）时为 null。 */
  draftId?: string | null
  /** 首次保存草稿成功后回调新生成的 id，父组件据此把 sessionId 状态同步过来，
   *  后续再点「保存草稿」/「开始澄清」时才知道要原地更新而不是重复创建。 */
  onDraftSaved?: (id: string) => void
  /** 打开「AI 需求拆分」确认弹框，传入要分析的会话 id（还没有草稿时先自动保存一份再传）。 */
  onSplit?: (id: string) => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [rawInput, setRawInput] = useState(initialRawInput)
  const [project, setProject] = useState(initialProject)
  // 多系统仍使用历史逗号分隔字段持久化，并约定首项是主系统，无需修改存量 schema。
  const [primaryProject, setPrimaryProject] = useState(splitCatalogValues(initialProject)[0] ?? '')
  const [module, setModule] = useState(initialModule)
  const [role, setRole] = useState<'PRODUCT' | 'BUSINESS'>('PRODUCT')
  const [documentProfile, setDocumentProfile] = useState<DocumentProfile>(initialDocumentProfile)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  /** 点「开始澄清」/「Vibe Coding 澄清」时先弹出 StartClarifyDialog 确认需求类型+深度，
   *  确认后才真正调用对应的 onStart/onStartVibe；null 表示弹框未打开。 */
  const [pendingAction, setPendingAction] = useState<'start' | 'startVibe' | null>(null)
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
  useEffect(() => { setDocumentProfile(initialDocumentProfile) }, [initialDocumentProfile])

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
  const saveDraftMut = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), rawInput: buildFinalRawInput(rawInput, attachments), project, module, documentProfile }
      return draftId ? updateDraft(draftId, payload) : saveDraft(payload)
    },
    onSuccess: (session) => {
      setDraftSavedAt(Date.now())
      if (!draftId) onDraftSaved?.(session.id)
    },
  })

  /**
   * 「AI 拆分需求」需要一个已存在的会话 id 才能调用（拆分接口按 sessionId 读 rawInput）。
   * 还没保存过草稿（draftId 为空）时先静默保存一份再打开拆分弹框，用户不用先手动点
   * 「保存草稿」再点「拆分」——两步合一步。
   */
  const [preparingSplit, setPreparingSplit] = useState(false)
  const handleSplitClick = async () => {
    if (!onSplit) return
    setPreparingSplit(true)
    try {
      const id = draftId ?? (await saveDraftMut.mutateAsync()).id
      onSplit(id)
    } finally {
      setPreparingSplit(false)
    }
  }

  const projectTags = splitCatalogValues(project)
  const moduleTags = splitCatalogValues(module)

  // 标题必填；描述 OR 至少有一个附件即可提交
  const canSubmit = title.trim() && (rawInput.trim() || attachments.length > 0)

  return (
    <div className="flex-1 min-w-0 p-4 overflow-y-auto md:p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">文档模式</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setDocumentProfile('CLASSIC')}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${documentProfile === 'CLASSIC' ? 'border-blue-500/40 bg-blue-500/10' : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'}`}
            >
              <div className="text-sm font-semibold">经典文档</div>
              <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">PRD → TDD → 开发 → 进度评估</p>
            </button>
            <button
              type="button"
              onClick={() => setDocumentProfile('SPEC_DRIVEN')}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${documentProfile === 'SPEC_DRIVEN' ? 'border-violet-500/40 bg-violet-500/10' : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'}`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                规格驱动 <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-500">推荐试用</span>
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">核心规格 → 执行计划 → 开发 → 证据评估 → 规格更新</p>
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">两种模式复用相同的手动步骤、版本历史和代码评估，只改变文档结构与追踪粒度。</p>
        </div>

        {/* 角色切换：决定 Claude 澄清的问题深度和语言风格 */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">你是谁？（决定 Claude 如何提问）</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(['PRODUCT', 'BUSINESS'] as const).map((r) => {
              const cfg = ROLE_CONFIG[r]
              const active = role === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active ? cfg.bg : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-sm font-semibold ${active ? cfg.color : 'text-[var(--color-foreground)]'}`}>
                      {cfg.label}
                    </span>
                    {active && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        {cfg.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">
                    {cfg.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* 快速示例（标题和 rawInput 都为空时才展示，避免干扰已输入的内容） */}
        {!title.trim() && !rawInput.trim() && (
          <div>
            <div className="text-xs text-[var(--color-muted-foreground)] mb-2 flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              演示示例（一键加载）
            </div>
            <div className="flex gap-2 flex-wrap">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => {
                    // 一次性加载完整示例数据（标题 + 原始需求 + 项目 + 模块）
                    setTitle(t.title)
                    setRawInput(t.rawInput)
                    setProject(t.project)
                    setPrimaryProject(splitCatalogValues(t.project)[0] ?? '')
                    setModule(t.module)
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border border-[var(--color-border)] hover:border-[var(--color-ring)] bg-[var(--color-muted)]/30 text-[var(--color-foreground)] transition-colors"
                >
                  {t.label}
                  <span className="text-[var(--color-muted-foreground)]">· {t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">需求标题 <span className="text-red-500">*</span></label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：用户权限管理模块 - 支持角色继承"
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
        </div>

        <SystemModuleSelector
          systems={projectTags}
          modules={moduleTags}
          primarySystem={primaryProject}
          onSystemsChange={(systems, primarySystem) => {
            setProject(systems.join(', '))
            setPrimaryProject(primarySystem)
          }}
          onModulesChange={(modules) => setModule(modules.join(', '))}
        />

        {/* 原始需求描述 + 附件上传区 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">原始需求描述 <span className="text-red-500">*</span></label>
            {/* 附件上传按钮 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[var(--color-border)] hover:border-[var(--color-ring)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
              title="上传 Markdown / PDF / Word 文件，提取文字作为需求描述"
            >
              {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
              {uploadingFile ? '解析中…' : '上传附件'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.pdf,.docx,.doc"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </div>
          <textarea
            ref={textareaRef}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onPaste={handlePasteImage}
            rows={attachments.length > 0 ? 4 : 8}
            placeholder={`${ROLE_CONFIG[role].placeholder}\n\n（可直接 Ctrl+V 粘贴截图/图片，边写边贴）`}
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />

          {/* 上传错误 */}
          {uploadError && (
            <p className="text-xs text-red-500 mt-1">{uploadError}</p>
          )}
          {imageUploadError && (
            <p className="text-xs text-red-500 mt-1">{imageUploadError}</p>
          )}

          {/* 已粘贴的图片：缩略图条，跟文本域里插入的 ![粘贴图片N](url) 一一对应，
              点 × 连同文本域里的 Markdown 语法一起移除 */}
          {(pastedImages.length > 0 || uploadingImage) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {pastedImages.map((img) => (
                <div key={img.id} className="relative group flex-shrink-0">
                  <img
                    src={img.url}
                    alt={img.name}
                    title={img.name}
                    className="w-14 h-14 object-cover rounded-lg border border-[var(--color-border)]"
                  />
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

          {/* 已上传附件列表 */}
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-[var(--color-muted-foreground)] mb-1.5">
                附件内容将自动追加到需求描述（共 {attachments.length} 个）：
              </p>
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30">
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
        </div>

        {/* 两种澄清模式都先弹 StartClarifyDialog，区别只是弹框里问什么：
            产品/开发角色问需求类型 + 澄清深度 + 澄清方式；业务员角色只问澄清方式
            （技术分类和轮数业务员判断不了，仍交给后端 LLM 自动判定，见
            PrdClarifyService.classifyReqType），但渐进式/批量是纯交互偏好，不该连带剥夺。
            Vibe Coding 入口走独立长会话，没有批量/渐进之分，业务员角色因此无可问项，直接进入。 */}
        {/* 移动端换行摆放：四个按钮挤一行会被压到只剩图标宽度，主按钮独占一行、其余自动折行 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 标准模式（内嵌简化 UI） */}
          <button
            disabled={!canSubmit}
            onClick={() => setPendingAction('start')}
            className="w-full py-2.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity md:w-auto md:flex-1"
          >
            {role === 'BUSINESS' ? '开始描述我的业务需求' : '开始澄清'}
          </button>
          {/* Vibe Coding 模式（完整工具调用可见） */}
          <button
            disabled={!canSubmit}
            onClick={() => setPendingAction('startVibe')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="在 Vibe Coding 中澄清：完整可见工具调用、MCP/CLI 查询过程"
          >
            <Code2 className="w-3.5 h-3.5" />
            Vibe Coding 澄清
          </button>
          {/* 保存草稿：只需要标题，需求描述可以先空着，不触发任何 AI 调用，随时可以回来继续 */}
          <button
            type="button"
            disabled={!title.trim() || saveDraftMut.isPending}
            onClick={() => saveDraftMut.mutate()}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-ring)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="只存标题/项目/模块/需求描述，不触发任何 AI 调用（不判定需求类型、不发起澄清）"
          >
            {saveDraftMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存草稿
          </button>
          {/* AI 需求拆分：需求比较大/包含多个功能点时，先让 Claude 判断能否拆成多个可独立
              澄清/开发的子需求。还没保存过草稿时点击会先静默存一份（拆分接口需要一个会话 id）。 */}
          {onSplit && (
            <button
              type="button"
              disabled={!canSubmit || preparingSplit}
              onClick={handleSplitClick}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted-foreground)] hover:text-indigo-400 hover:border-indigo-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="需求比较大/包含多个功能点时，先让 Claude 判断能否拆成多个子需求"
            >
              {preparingSplit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              AI 拆分需求
            </button>
          )}
        </div>
        {draftSavedAt && (
          <p className="text-[11px] text-[var(--color-muted-foreground)] text-right">
            草稿已保存 · {new Date(draftSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {saveDraftMut.isError && (
          <p className="text-[11px] text-red-500 text-right">
            草稿保存失败：{saveDraftMut.error instanceof Error ? saveDraftMut.error.message : '未知错误'}
          </p>
        )}
      </div>

      {pendingAction && (
        <StartClarifyDialog
          showModeToggle={pendingAction === 'start'}
          showTypeAndDepth={role !== 'BUSINESS'}
          showEngineToggle
          onClose={() => setPendingAction(null)}
          onConfirm={(reqType, maxQuestions, clarifyMode, engine) => {
            const action = pendingAction
            setPendingAction(null)
            if (action === 'start') {
              onStart(title.trim(), buildFinalRawInput(rawInput, attachments), project, module, role, reqType, maxQuestions, clarifyMode, draftId ?? undefined, engine, documentProfile)
            } else {
              onStartVibe(title.trim(), buildFinalRawInput(rawInput, attachments), project, module, role, reqType, maxQuestions, draftId ?? undefined, engine, documentProfile)
            }
          }}
        />
      )}
    </div>
  )
}

// ───── 生成阶段流式展示（含失败重试 UI） ─────
