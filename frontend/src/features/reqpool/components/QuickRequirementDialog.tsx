import { useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import { SystemModuleSelector } from '@/components/prd/SystemModuleSelector'
import { saveDraft } from '@/features/prd-clarify/api'
import {
  parsePrdAttachment,
  uploadPrdImage,
  type PrdAttachmentParseResult,
  type PrdImageAttachmentResult,
} from '@/lib/prdAttachments'
import { syncFromPrd } from '../api'

interface QuickRequirementDialogProps {
  onClose: () => void
  onSaved: (title: string) => void
}

type BusyState = 'file' | 'image' | 'save' | null
type PastedImage = PrdImageAttachmentResult & { token: string }
type DescriptionGuideType = 'BUG_FIX' | 'MODULE_ADJUST' | 'NEW_CAPABILITY'

/** 最短登记路径：系统、模块、标题、描述与附件，保存后只形成 DRAFT，不启动 AI 澄清。 */
export function QuickRequirementDialog({ onClose, onSaved }: QuickRequirementDialogProps) {
  const [systems, setSystems] = useState<string[]>([])
  const [primarySystem, setPrimarySystem] = useState('')
  const [modules, setModules] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [guideType, setGuideType] = useState<DescriptionGuideType>('BUG_FIX')
  const [showExample, setShowExample] = useState(false)
  const [attachments, setAttachments] = useState<PrdAttachmentParseResult[]>([])
  const [images, setImages] = useState<PastedImage[]>([])
  const [busy, setBusy] = useState<BusyState>(null)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageCounterRef = useRef(0)

  const canSave = title.trim().length > 0
    && description.trim().length > 0
    && !busy
  const activeGuide = DESCRIPTION_GUIDES[guideType]
  const descriptionChecks = getDescriptionChecks(description, systems, modules)
  const completedCheckCount = descriptionChecks.filter(item => item.done).length

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
        const cursor = start + inserted.length
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(cursor, cursor)
      })
    } catch (cause) {
      setError(messageOf(cause, '图片上传失败'))
    } finally {
      setBusy(null)
    }
  }

  const handleSave = async () => {
    if (!canSave) return
    setBusy('save')
    setError('')
    try {
      const rawInput = buildRawInput(description, attachments)
      await saveDraft({
        title: title.trim(),
        rawInput,
        project: systems.join(', '),
        module: modules.join(', '),
        businessFields: {
          requirementDetail: description.trim(),
          attachments: attachments.map(item => `[${item.fileName}](${item.url})`).join('\n'),
        },
      })
      await syncFromPrd()
      onSaved(title.trim())
    } catch (cause) {
      setError(messageOf(cause, '草稿保存失败'))
      setBusy(null)
    }
  }

  const removeImage = (image: PastedImage) => {
    setDescription(current => current.replace(`${image.token}\n`, '').replace(image.token, ''))
    setImages(current => current.filter(item => item.id !== image.id))
  }

  const insertDescriptionTemplate = () => {
    setDescription(current => current.trim()
      ? `${current.trim()}\n\n${activeGuide.template}`
      : activeGuide.template)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const end = textareaRef.current?.value.length ?? 0
      textareaRef.current?.setSelectionRange(end, end)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-requirement-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><Sparkles className="h-4 w-4" /></span>
            <div>
              <div className="flex items-center gap-2"><h2 id="quick-requirement-title" className="text-base font-semibold">快速起草需求</h2><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">约 1 分钟</span></div>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">先保存事实，暂不启动 AI 澄清；需要推进时再补充完整信息。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="rounded-lg p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40"><X className="h-4 w-4" /></button>
        </header>

        <div className="space-y-5 overflow-y-auto p-6">
          <SystemModuleSelector
            systems={systems}
            modules={modules}
            primarySystem={primarySystem}
            onSystemsChange={(nextSystems, nextPrimarySystem) => {
              setSystems(nextSystems)
              setPrimarySystem(nextPrimarySystem)
            }}
            onModulesChange={setModules}
          />
          <p className="-mt-3 text-[10px] text-[var(--color-muted-foreground)]">系统和模块可暂不填写；新增系统或模块可直接输入名称后按 Enter。</p>

          <label className="block text-xs font-medium">
            <span className="mb-1.5 block">需求标题<span className="ml-1 text-rose-500">*</span></span>
            <input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="一句话说明要解决什么问题" className={inputClass} autoFocus />
          </label>

          <div className="block text-xs font-medium">
            <span className="mb-1.5 flex items-center justify-between">
              <label htmlFor="quick-requirement-description">需求描述<span className="ml-1 text-rose-500">*</span></label>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!!busy} className="inline-flex items-center gap-1.5 font-normal text-[var(--color-muted-foreground)] hover:text-violet-600 disabled:opacity-40">
                {busy === 'file' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                上传附件
              </button>
            </span>
            <input ref={fileInputRef} type="file" accept=".md,.txt,.pdf,.docx,.doc" multiple className="hidden" onChange={event => handleFiles(event.target.files)} />

            <div className="mb-2.5 rounded-xl border border-violet-200 bg-violet-50/65 p-3.5 dark:border-violet-900/70 dark:bg-violet-950/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-violet-950 dark:text-violet-100">不用写技术方案，照着 5 句话讲清业务事实</p>
                  <p className="mt-1 font-normal leading-5 text-violet-800/80 dark:text-violet-200/75">在哪里，谁在什么情况下，遇到了什么，希望变成什么，怎样才算完成。AI 会根据这些事实继续澄清。</p>
                </div>
                <button type="button" onClick={insertDescriptionTemplate} className="shrink-0 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-[11px] font-medium text-violet-700 shadow-sm hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-900/50">
                  {description.trim() ? '追加填写模板' : '插入填写模板'}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="选择需求描述模板">
                {(Object.entries(DESCRIPTION_GUIDES) as [DescriptionGuideType, DescriptionGuide][]).map(([type, guide]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setGuideType(type)
                      setShowExample(false)
                    }}
                    aria-pressed={guideType === type}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${guideType === type ? 'bg-violet-600 text-white' : 'bg-white/80 text-violet-800 hover:bg-violet-100 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-900/50'}`}
                  >
                    {guide.label}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 font-normal leading-5 text-[10px] text-violet-800/80 dark:text-violet-200/70">{activeGuide.tip}</p>
              <button type="button" onClick={() => setShowExample(current => !current)} aria-expanded={showExample} className="mt-1 inline-flex items-center gap-1 font-normal text-[10px] text-violet-700 hover:text-violet-900 dark:text-violet-300">
                看一段合格示例
                <ChevronDown className={`h-3 w-3 transition-transform ${showExample ? 'rotate-180' : ''}`} />
              </button>
              {showExample && <div className="mt-2 rounded-lg bg-white/75 px-3 py-2.5 font-normal leading-5 text-[10px] text-violet-950 dark:bg-black/15 dark:text-violet-100">{activeGuide.example}</div>}
            </div>

            <textarea
              id="quick-requirement-description"
              ref={textareaRef}
              value={description}
              onChange={event => setDescription(event.target.value)}
              onPaste={handlePaste}
              rows={8}
              placeholder={'可以直接说人话，也可以点击上方“插入填写模板”。\n支持 Ctrl+V 粘贴截图，不确定模块时可粘贴出问题的页面 URL。'}
              className={`${inputClass} resize-y leading-6`}
            />
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--color-muted-foreground)]"><span>支持文本、Markdown、Word、PDF 和粘贴图片</span><span>{description.length} 字</span></div>
            <div className="mt-2.5 rounded-xl bg-[var(--color-muted)]/45 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-medium">AI / 研发可用度</span>
                <span className={`text-[10px] font-semibold ${completedCheckCount === descriptionChecks.length ? 'text-emerald-600' : 'text-amber-600'}`}>{completedCheckCount}/{descriptionChecks.length} 项已说明</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                {descriptionChecks.map(item => (
                  <span key={item.label} className={`inline-flex items-center gap-1 text-[10px] font-normal ${item.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-muted-foreground)]'}`}>
                    {item.done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {(images.length > 0 || busy === 'image') && (
            <div className="rounded-xl bg-[var(--color-muted)]/45 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">{busy === 'image' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}{busy === 'image' ? '正在上传粘贴图片…' : `${images.length} 张图片已写入需求描述`}</div>
              <div className="flex flex-wrap gap-2">{images.map(image => <div key={image.id} className="group relative"><img src={image.url} alt={image.name} className="h-16 w-16 rounded-lg border border-[var(--color-border)] object-cover" /><button type="button" onClick={() => removeImage(image)} className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow group-hover:flex"><X className="h-3 w-3" /></button></div>)}</div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
              {attachments.map((attachment, index) => (
                <div key={`${attachment.fileId}-${index}`} className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5 text-xs last:border-b-0">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">已解析 {(attachment.text.length / 1000).toFixed(1)}k 字</span>
                  <button type="button" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-1 hover:bg-[var(--color-muted)]"><X className="h-3 w-3 text-[var(--color-muted-foreground)]" /></button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-[var(--color-border)] bg-[var(--color-background)]/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />保存后进入需求池，状态为“待受理”</div>
          <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={!!busy} className="rounded-lg px-4 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40">取消</button><button type="button" onClick={handleSave} disabled={!canSave} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-35">{busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{busy === 'save' ? '正在保存…' : '保存需求草稿'}</button></div>
        </footer>
      </section>
    </div>
  )
}

function buildRawInput(description: string, attachments: PrdAttachmentParseResult[]) {
  const base = description.trim()
  if (attachments.length === 0) return base
  const appendix = attachments.map(attachment =>
    `[📎 附件：${attachment.fileName}](${attachment.url})\n---\n【附件：${attachment.fileName}】\n${attachment.text}${attachment.truncated ? '\n（内容已截断）' : ''}\n---`
  ).join('\n\n')
  return `${base}\n\n${appendix}`
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback
}

interface DescriptionGuide {
  label: string
  tip: string
  template: string
  example: string
}

const DESCRIPTION_GUIDES: Record<DescriptionGuideType, DescriptionGuide> = {
  BUG_FIX: {
    label: '修复一个问题',
    tip: '请给出系统和模块；不知道模块时，粘贴出问题的页面 URL 也算定位。最好附上截图、报错或可复现的数据。',
    template: `【使用位置】系统 / 模块或页面 URL：
【谁遇到了】使用人或部门：
【什么时候发生】做什么操作时出现：
【现在的问题】实际发生了什么，能否重复出现：
【希望结果】正确结果应该是什么：
【怎么验收】修复后满足哪些条件：
【补充证据】截图、报错、日志或示例数据（没有可不填）：`,
    example: '库存系统 / 出库单详情页。仓库文员保存含小数数量的出库单时会提示“参数错误”，每天约 20 单受影响，重复操作可以复现。希望支持两位小数且不改变现有权限。验收：数量 1.25 可正常保存、再次打开数值不变、整数出库不受影响。已附报错截图和单号。',
  },
  MODULE_ADJUST: {
    label: '优化现有功能',
    tip: '请给出要调整的系统和模块；不知道模块时可填写页面 URL。说明当前怎么做、哪里费时或容易出错，以及不能影响什么。',
    template: `【使用位置】系统 / 模块或页面 URL：
【谁在使用】使用人或部门：
【当前做法】现在要经过哪些步骤：
【遇到的问题】哪里费时、容易出错或影响业务：
【希望改成】调整后的操作或结果：
【怎么验收】用什么结果判断已完成：
【影响与边界】哪些角色、数据或原有能力不能受影响：`,
    example: '客服系统 / 工单列表页。客服主管每天需要逐条打开工单确认是否超时，约花 40 分钟，也容易漏看。希望列表增加“即将超时”筛选并显示剩余时间。验收：可筛出 2 小时内超时的未关闭工单，时间与详情一致，普通客服仍只能看到自己权限范围内的工单。',
  },
  NEW_CAPABILITY: {
    label: '新增功能 / 系统',
    tip: '新系统、新模块可以没有现成位置，直接写“新增”并说明准备归属哪个业务域。重点讲清使用人、业务目标、本次范围和验收结果。',
    template: `【谁要使用】使用人或部门：
【业务场景】在什么情况下使用：
【想解决什么】现在为什么做不了或做得不好：
【希望怎么做】期望的新能力和核心步骤：
【怎么验收】完成后必须达到的结果：
【拟归属】现有系统 / 业务域；全新系统可写“新增”：
【本次边界】这次明确不做什么：`,
    example: '新增“合同到期提醒”能力，供销售和法务使用。目前靠个人日历记录，人员变动后容易遗漏。希望在合同到期前 30、7、1 天提醒合同负责人，并让法务看到所有未处理合同。验收：三类提醒按时生成、负责人可标记已处理、权限符合销售只看本人而法务看全部。本次不包含自动续签。',
  },
}

function getDescriptionChecks(description: string, systems: string[], modules: string[]) {
  const text = description.trim()
  const hasFilledField = (...names: string[]) => text.split(/\r?\n/).some(line => {
    if (!names.some(name => line.includes(name))) return false
    const value = line.split(/[：:]/).slice(1).join(':').trim()
    return value.length >= 2
  })
  const hasLocation = systems.length > 0
    || modules.length > 0
    || /https?:\/\/\S+/i.test(text)
    || hasFilledField('使用位置', '拟归属')
    || /(新增|全新)(系统|模块|能力|功能)/.test(text)

  return [
    { label: '位置或归属', done: hasLocation },
    {
      label: '使用人和场景',
      done: hasFilledField('谁遇到了', '谁在使用', '谁要使用', '什么时候发生', '业务场景')
        || /(用户|客户|客服|运营|销售|法务|财务|员工|部门|角色).{0,18}(使用|操作|办理|查看|需要|遇到)/.test(text),
    },
    {
      label: '当前问题',
      done: hasFilledField('现在的问题', '遇到的问题', '当前做法', '想解决什么')
        || /(目前|现在|当前|问题|报错|失败|无法|费时|容易|遗漏|影响).{2,}/.test(text),
    },
    {
      label: '期望结果',
      done: hasFilledField('希望结果', '希望改成', '希望怎么做')
        || /(希望|期望|需要|改为|支持|新增|优化).{3,}/.test(text),
    },
    {
      label: '验收标准',
      done: hasFilledField('怎么验收')
        || /(验收|完成标准|成功标准|满足以下|必须达到).{2,}/.test(text),
    },
  ]
}

const inputClass = 'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[var(--color-muted-foreground)] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10'
