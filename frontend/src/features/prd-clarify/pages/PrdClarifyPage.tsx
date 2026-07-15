import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { BotMessageSquare, ChevronRight, Code2, Copy, ExternalLink, FileText, Layers, Loader2, Plus, Rocket, Send, Trash2, User, X } from 'lucide-react'
import { http } from '@/lib/api'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
// doc-viewer 的 markdown.css 含完整 prose 样式（标题层级/代码块/表格等），无需 @tailwindcss/typography
import '@/features/doc-viewer/styles/markdown.css'
import {
  askNextQuestion,
  createSession,
  deleteSession,
  getContent,
  getSession,
  linkPrdToReqItem,
  listSessions,
  saveContent,
  saveQaHistory,
  startGenerate,
  type QaPair,
} from '../api'
import type { PrdSessionView, PrdStep, QuestionItem } from '../types'
import { useConfirm } from '@/components/ui/confirm-dialog'

// 编辑器 lazy import — CodeMirror chunk 只在进入 EDITING 步骤时加载
const MarkdownEditor = lazy(() =>
  import('@/features/doc-viewer/components/MarkdownEditor').then((m) => ({
    default: m.MarkdownEditor,
  }))
)

// ───── Markdown 预览：复用 doc-viewer 的 markdown.css 样式（标题层级/代码块/表格完整渲染） ─────
function MarkdownViewer({ content }: { content: string }) {
  const html = DOMPurify.sanitize(marked.parse(content, { async: false }) as string)
  return (
    <div className="h-full overflow-y-auto p-6">
      {/* doc-viewer-md 类由 doc-viewer/styles/markdown.css 定义，包含完整 prose 排版 */}
      <div
        className="doc-viewer-md max-w-none"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

// ───── 步骤指示器 ─────
const STEP_LABELS = ['填写需求', 'AI 渐进澄清', '生成 / 编辑 PRD']
function stepIndex(step: PrdStep): number {
  if (step === 'INPUT') return 0
  if (step === 'CHATTING') return 1
  return 2
}

/**
 * @param onClickStep 若传入，已完成的步骤可点击（用于从第 3 步查看第 2 步澄清记录）
 */
function StepBar({ step, onClickStep }: { step: PrdStep; onClickStep?: (idx: number) => void }) {
  const active = stepIndex(step)
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-card)]">
      {STEP_LABELS.map((label, i) => {
        // 只有步骤 2（i=1，AI渐进澄清）可点击查看历史；步骤 1 回退等于重新开始，不可点
        const clickable = i === 1 && active > 1 && !!onClickStep
        return (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => clickable && onClickStep?.(i)}
              disabled={!clickable}
              title={clickable ? `查看${label}` : undefined}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-opacity
                ${i <= active
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}
                ${clickable ? 'cursor-pointer hover:opacity-80 ring-2 ring-[var(--color-primary)]/30' : 'cursor-default'}`}
            >
              {i + 1}
            </button>
            <span
              onClick={() => clickable && onClickStep?.(i)}
              className={`text-sm ${i === active ? 'font-medium' : 'text-[var(--color-muted-foreground)]'} ${clickable ? 'cursor-pointer hover:text-[var(--color-foreground)]' : ''}`}
            >
              {label}
              {clickable && <span className="ml-1 text-[10px] text-[var(--color-primary)] opacity-70">↩</span>}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <ChevronRight className="w-4 h-4 text-[var(--color-muted-foreground)]" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ───── 澄清记录只读抽屉 ─────
function ClarifyHistorySheet({
  questions,
  onClose,
}: {
  questions: QuestionItem[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="font-semibold text-sm">澄清问答记录</span>
            <span className="text-xs text-[var(--color-muted-foreground)]">（共 {questions.length} 题）</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {questions.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] italic">暂无澄清记录</p>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                {/* 问题 */}
                <div className="flex items-start gap-2.5 p-3 bg-[var(--color-muted)]/30">
                  <div className="w-5 h-5 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-[var(--color-primary)]">
                    {i + 1}
                  </div>
                  <p className="text-sm leading-relaxed">{q.question}</p>
                </div>
                {/* 答案 */}
                <div className="flex items-start gap-2.5 p-3 border-t border-[var(--color-border)]">
                  <User className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--color-muted-foreground)]" />
                  <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
                    {q.answer || <span className="italic">（未填写）</span>}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          此记录已纳入 PRD 生成，关闭后可继续编辑文档
        </div>
      </div>
    </div>
  )
}

// ───── 历史侧边栏 ─────
function HistoryPanel({
  sessions,
  activeId,
  onSelect,
  onDelete,
}: {
  sessions: PrdSessionView[]
  activeId: string | null
  onSelect: (s: PrdSessionView) => void
  onDelete: (id: string) => void
}) {
  const confirm = useConfirm()

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const ok = await confirm({ title: '删除确认', description: '删除后不可恢复，包括本地 .md 文件。', variant: 'destructive' })
    if (ok) onDelete(id)
  }

  const statusColor: Record<string, string> = {
    DONE: 'text-green-500',
    GENERATING: 'text-blue-500',
    CLARIFYING: 'text-yellow-500',
    ANSWERING: 'text-yellow-500',
    ERROR: 'text-red-500',
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide border-b border-[var(--color-border)]">
        历史记录
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="p-3 text-xs text-[var(--color-muted-foreground)]">暂无记录</div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s)}
            className={`group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--color-muted)]/40 transition-colors
              ${s.id === activeId ? 'bg-[var(--color-muted)]/60' : ''}`}
          >
            <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-muted-foreground)]" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{s.title}</div>
              {/* 项目 / 模块标签 */}
              {(s.project || s.module) && (
                <div className="text-[10px] text-[var(--color-muted-foreground)] truncate mt-0.5">
                  {[s.project, s.module].filter(Boolean).join(' · ')}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-[10px] ${statusColor[s.status] ?? 'text-[var(--color-muted-foreground)]'}`}>
                  {s.status}
                </span>
                {/* 角色标记 */}
                {s.role === 'BUSINESS' ? (
                  <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">
                    业务
                  </span>
                ) : (
                  <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-500 border border-blue-500/20 leading-tight">
                    产品
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => handleDelete(e, s.id)}
              className="hidden group-hover:flex items-center text-[var(--color-muted-foreground)] hover:text-red-500"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ───── 快捷示例模板（围绕需求管理池模块展开） ─────
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
function InputPanel({
  onStart,
  initialTitle = '',
  initialRawInput = '',
  initialProject = '',
  initialModule = '',
}: {
  onStart: (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS') => void
  initialTitle?: string
  initialRawInput?: string
  initialProject?: string
  initialModule?: string
}) {
  const [title, setTitle] = useState(initialTitle)
  const [rawInput, setRawInput] = useState(initialRawInput)
  const [project, setProject] = useState(initialProject)
  const [module, setModule] = useState(initialModule)
  const [role, setRole] = useState<'PRODUCT' | 'BUSINESS'>('PRODUCT')

  // 当外部初始值变化时（如从 showcase 跳转带参数）同步更新
  useEffect(() => { if (initialTitle) setTitle(initialTitle) }, [initialTitle])
  useEffect(() => { if (initialRawInput) setRawInput(initialRawInput) }, [initialRawInput])
  useEffect(() => { if (initialProject) setProject(initialProject) }, [initialProject])
  useEffect(() => { if (initialModule) setModule(initialModule) }, [initialModule])

  // 拉取项目列表（统一走 http()，确保 token 续期逻辑生效）
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => http<{ items: Array<{ name: string; path: string }> }>('/projects'),
  })

  // 拉取模块列表（选了项目后）
  const { data: modulesData } = useQuery({
    queryKey: ['project-modules', project],
    queryFn: () => {
      const item = projectsData?.items?.find((p) => p.name === project)
      if (!item) return null
      return http<{ modules: Array<{ name: string }> }>(
        `/claude-chat/workspaces/modules?path=${encodeURIComponent(item.path)}`
      )
    },
    enabled: !!project && !!projectsData,
  })

  const modules: Array<{ name: string }> = modulesData?.modules ?? []
  const projects: Array<{ name: string }> = projectsData?.items ?? []

  const canSubmit = title.trim() && rawInput.trim()

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* 角色切换：决定 Claude 澄清的问题深度和语言风格 */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">你是谁？（决定 Claude 如何提问）</label>
          <div className="grid grid-cols-2 gap-2">
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

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">关联项目（可选）</label>
            {/* input+datalist：预填值永远生效，项目列表作为候选提示 */}
            <input
              id="project-input"
              list="project-datalist"
              value={project}
              onChange={(e) => { setProject(e.target.value); setModule('') }}
              placeholder="如：kai-toolbox（可手动输入）"
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
            <datalist id="project-datalist">
              {projects.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">关联模块（可选）</label>
            {/* 改用 input+datalist：预填值（来自 URL 参数）永远生效，加载到的模块作为候选提示 */}
            <input
              id="module-input"
              list="module-datalist"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              placeholder="如：tool-reqpool（可手动输入）"
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
            <datalist id="module-datalist">
              {modules.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">原始需求描述 <span className="text-red-500">*</span></label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={8}
            placeholder={ROLE_CONFIG[role].placeholder}
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
        </div>

        <button
          disabled={!canSubmit}
          onClick={() => onStart(title.trim(), rawInput.trim(), project, module, role)}
          className="w-full py-2.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {role === 'BUSINESS' ? '开始描述我的业务需求' : '开始需求澄清'}
        </button>
      </div>
    </div>
  )
}

// ───── 生成阶段流式展示（含失败重试 UI） ─────
function GeneratingPanel({
  streamText,
  failed,
  onRetry,
}: {
  streamText: string
  failed: boolean
  onRetry: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [streamText])

  if (failed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <X className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <p className="font-medium text-[var(--color-foreground)] mb-1">PRD 生成未能完成</p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            可能是 Claude Agent 超时（复杂需求通常需要 60-120 秒）。<br />
            问答历史已保存，点击重试即可直接重新生成。
          </p>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90"
        >
          <Loader2 className="w-4 h-4" />
          重新生成 PRD
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      <div className="flex items-center gap-2 mb-4 text-sm text-[var(--color-muted-foreground)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Claude 正在撰写 PRD 文档…</span>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-[var(--color-muted)]/30 p-4 text-sm whitespace-pre-wrap break-words leading-relaxed">
        {streamText || <span className="italic">等待 Claude 响应…</span>}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ───── 多轮渐进澄清对话面板（Step CHATTING） ─────
function ChattingPanel({
  sessionId,
  onDone,       // 澄清完成，带完整 history 调用
  onError,
}: {
  sessionId: string
  onDone: (history: QaPair[]) => void
  onError: (msg: string) => void
}) {
  const [history, setHistory] = useState<QaPair[]>([])          // 已完成的 Q&A
  const [currentQ, setCurrentQ] = useState('')                  // 当前问题（流式积累）
  const [currentA, setCurrentA] = useState('')                  // 用户正在输入的答案
  const [isStreaming, setIsStreaming] = useState(true)          // Claude 正在输出问题
  const abortRef = useRef<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

  // 挂载时立即开始第一个问题
  useEffect(() => {
    askQuestion(0, [])
    return () => abortRef.current?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { scrollToBottom() }, [history, currentQ])

  // 当 Claude 输出完毕后聚焦输入框
  useEffect(() => {
    if (!isStreaming && currentQ && !currentQ.includes('[CLARIFICATION_COMPLETE]')) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isStreaming, currentQ])

  const askQuestion = (index: number, hist: QaPair[]) => {
    setCurrentQ('')
    setIsStreaming(true)
    const accRef = { current: '' }

    const abort = askNextQuestion(sessionId, index, hist, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const chunk = (data as { content: string }).content ?? ''
          accRef.current += chunk
          setCurrentQ(accRef.current)
        }
        if (name === 'done') {
          setIsStreaming(false)
          const text = accRef.current.trim()
          if (text.includes('[CLARIFICATION_COMPLETE]')) {
            // 澄清完成，把历史传给父组件
            onDone(hist)
          }
        }
        if (name === 'error') {
          setIsStreaming(false)
          onError((data as { message: string }).message ?? '澄清失败')
        }
      },
      onError() {
        setIsStreaming(false)
        onError('SSE 连接失败，请重试')
      },
    })
    abortRef.current = abort
  }

  const handleSubmitAnswer = () => {
    const answer = currentA.trim()
    if (!answer) return

    const newPair: QaPair = { question: currentQ, answer }
    const newHistory = [...history, newPair]
    setHistory(newHistory)
    setCurrentA('')
    setCurrentQ('')

    // 触发下一个问题
    askQuestion(newHistory.length, newHistory)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmitAnswer()
    }
  }

  const isDone = !isStreaming && currentQ.includes('[CLARIFICATION_COMPLETE]')
  const maxRounds = 5
  const progress = Math.round(((history.length) / maxRounds) * 100)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 进度条 + 角色提示 */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          AI 渐进澄清：{history.length} / {maxRounds} 题
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)]">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {isStreaming && (
          <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            Claude 思考中…
          </div>
        )}
      </div>

      {/* 对话气泡区 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* 历史 Q&A */}
        {history.map((qa, i) => (
          <div key={i} className="space-y-2">
            {/* Claude 气泡 */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
                <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 rounded-2xl rounded-tl-sm bg-[var(--color-muted)]/50 px-4 py-2.5 text-sm leading-relaxed max-w-2xl">
                {qa.question}
              </div>
            </div>
            {/* 用户气泡 */}
            <div className="flex items-start gap-3 justify-end">
              <div className="flex-1 rounded-2xl rounded-tr-sm bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 px-4 py-2.5 text-sm leading-relaxed max-w-2xl text-right ml-8">
                {qa.answer}
              </div>
              <div className="w-7 h-7 rounded-full bg-[var(--color-muted)] flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              </div>
            </div>
          </div>
        ))}

        {/* 当前问题（流式中或已完成） */}
        {currentQ && !isDone && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
              <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
            </div>
            <div className="flex-1 rounded-2xl rounded-tl-sm bg-[var(--color-muted)]/50 px-4 py-2.5 text-sm leading-relaxed max-w-2xl">
              {currentQ}
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-[var(--color-primary)] rounded animate-pulse ml-1 align-middle" />
              )}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* 输入区 */}
      {!isDone && !isStreaming && currentQ && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={currentA}
              onChange={e => setCurrentA(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="输入你的回答… (Ctrl+Enter 提交)"
              className="flex-1 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
            <button
              disabled={!currentA.trim()}
              onClick={handleSubmitAnswer}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-center text-[var(--color-muted-foreground)] mt-2">
            Claude 会根据你的回答动态追问，最多 {maxRounds} 轮
          </p>
        </div>
      )}

      {/* 流式中占位输入区 */}
      {isStreaming && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="max-w-3xl mx-auto h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 flex items-center px-3 text-xs text-[var(--color-muted-foreground)] italic">
            等待 Claude 提问…
          </div>
        </div>
      )}
    </div>
  )
}

// ───── 开发提示词 Dialog ─────
function StartDevDialog({
  title,
  content,
  onClose,
}: {
  title: string
  content: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const devPrompt = `你是一位经验丰富的软件工程师。请根据以下 PRD 进行功能开发：

---

${content}

---

请先：
1. 仔细阅读 PRD，理解需求边界和验收标准
2. 分析现有代码库结构，找到相关模块和接口
3. 制定实现方案并告诉我（涉及的文件、新增 API、数据库变更）
4. 按优先级逐步实现功能

准备好后请先输出实现计划，再开始写代码。`

  const handleCopy = () => {
    navigator.clipboard.writeText(devPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGotoWorkbench = () => {
    handleCopy()
    navigate('/tools/claude-chat')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="font-semibold text-sm">开始开发 — {title}</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 说明 */}
        <div className="px-5 py-3 bg-blue-500/5 border-b border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
            以下是基于 PRD 自动生成的开发提示词。复制后在
            <strong className="text-[var(--color-foreground)] mx-1">Vibe Coding 工作台</strong>
            选择项目目录，粘贴为第一条消息，Claude 会自动分析代码库并制定实现方案。
          </p>
        </div>

        {/* 提示词内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          <pre className="text-xs font-mono text-[var(--color-muted-foreground)] whitespace-pre-wrap leading-relaxed bg-[var(--color-muted)]/30 rounded-lg p-4">
            {devPrompt}
          </pre>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-foreground)] transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? '已复制！' : '复制提示词'}
          </button>
          <button
            onClick={handleGotoWorkbench}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity font-medium"
          >
            <Code2 className="w-3.5 h-3.5" />
            复制并打开工作台
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>
          <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">
            在工作台粘贴即可开始开发
          </span>
        </div>
      </div>
    </div>
  )
}

// ───── 编辑器面板（Step EDITING） ─────
function EditingPanel({
  sessionId,
  sessionTitle,
  initialContent,
  onReset,
}: {
  sessionId: string
  sessionTitle: string
  initialContent: string
  onReset: () => void
}) {
  const [content, setContent] = useState(initialContent)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [showDevDialog, setShowDevDialog] = useState(false)

  const handleChange = (next: string) => {
    setContent(next)
    setIsDirty(next !== initialContent)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveContent(sessionId, { content })
      setIsDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 开发提示词 Dialog */}
      {showDevDialog && (
        <StartDevDialog
          title={sessionTitle}
          content={content}
          onClose={() => setShowDevDialog(false)}
        />
      )}

      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)] gap-2">
        <div className="flex items-center gap-1 text-xs">
          {(['split', 'edit', 'preview'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 rounded ${
                viewMode === mode
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
              }`}
            >
              {mode === 'split' ? '分栏' : mode === 'edit' ? '编辑' : '预览'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* 核心功能按钮：开始开发 */}
          <button
            onClick={() => setShowDevDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 hover:text-green-300 font-medium transition-colors"
          >
            <Rocket className="w-3.5 h-3.5" />
            开始开发
          </button>
          <div className="w-px h-4 bg-[var(--color-border)]" />
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          >
            <Plus className="w-3 h-3" /> 新建
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          >
            <Copy className="w-3 h-3" /> 复制
          </button>
          <button
            disabled={!isDirty || saving}
            onClick={handleSave}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            保存
          </button>
          {isDirty && <span className="text-xs text-yellow-500">未保存</span>}
        </div>
      </div>

      {/* 编辑区 */}
      <div className="flex-1 flex overflow-hidden">
        {(viewMode === 'split' || viewMode === 'edit') && (
          <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'} h-full overflow-hidden`}>
            <Suspense fallback={<div className="p-4 text-sm text-[var(--color-muted-foreground)]">加载编辑器…</div>}>
              <MarkdownEditor
                value={content}
                onChange={handleChange}
                onSave={handleSave}
              />
            </Suspense>
          </div>
        )}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} h-full overflow-hidden`}>
            <MarkdownViewer content={content} />
          </div>
        )}
      </div>
    </div>
  )
}

// ───── 主页面 ─────
export function PrdClarifyPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [step, setStep] = useState<PrdStep>('INPUT')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState('')
  const [streamText, setStreamText] = useState('')
  const [prdContent, setPrdContent] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)  // GENERATING 失败，留在当前步骤显示重试
  const [showClarifyHistory, setShowClarifyHistory] = useState(false) // 查看澄清记录抽屉
  const abortRef = useRef<(() => void) | null>(null)
  // GENERATING 阶段用 ref 积累全文，done 时一次性赋值（避免双重 setState）
  const prdAccRef = useRef('')
  // 从 ChattingPanel 拿到的完整 QA history，用于 generate 时读取
  const qaHistoryRef = useRef<QaPair[]>([])
  // 来自需求管理池时，记录来源标题，用于顶部上下文条
  const [reqContextTitle, setReqContextTitle] = useState<string | null>(null)
  // 防止自动启动多次执行
  const autoStartedRef = useRef(false)

  // 读取 URL 参数
  const urlTitle = searchParams.get('title') ?? ''
  const urlRawInput = searchParams.get('rawInput') ?? ''
  const urlProject = searchParams.get('project') ?? ''
  const urlModule = searchParams.get('module') ?? ''
  /** 来自需求管理池的回写 ID：PRD 完成后自动将 PRD 会话关联回需求条目 */
  const urlReqItemId = searchParams.get('reqItemId') ?? ''
  /** 直接查看某个历史 PRD 会话（来自需求管理池「查看PRD」按钮） */
  const urlViewSession = searchParams.get('viewSession') ?? ''

  // 来自需求管理池（有 reqItemId + 内容）：自动建会话、跳过 INPUT 直接开始澄清
  // 用 ref 保证只执行一次，不因其他 state 变化重触
  useEffect(() => {
    if (autoStartedRef.current) return
    if (!urlReqItemId || !urlTitle || !urlRawInput) return
    autoStartedRef.current = true
    setReqContextTitle(urlTitle)
    // 直接调 handleStart，createMut 是稳定的 TanStack Query mutation
    createMut.mutateAsync({ title: urlTitle, rawInput: urlRawInput, project: urlProject, module: urlModule, role: 'PRODUCT' })
      .then((created) => {
        setSessionId(created.id)
        setSessionTitle(urlTitle)
        setSearchParams({}, { replace: true })
        qc.invalidateQueries({ queryKey: ['prd-sessions'] })
        setStep('CHATTING')
      })
      .catch(() => {
        autoStartedRef.current = false  // 创建失败可重试
        setErrorMsg('会话创建失败，请重试')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // 只在 mount 时执行一次

  // viewSession 参数：直接拉取会话内容并跳转到编辑器
  useEffect(() => {
    if (!urlViewSession) return
    setSearchParams({}, { replace: true })
    setSessionId(urlViewSession)
    getContent(urlViewSession)
      .then((content) => {
        setPrdContent(content ?? '')
        setStep('EDITING')
      })
      .catch(() => {
        setErrorMsg('读取 PRD 文件失败')
        setStep('INPUT')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlViewSession])

  // 当前会话详情
  const { data: session } = useQuery({
    queryKey: ['prd-session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId && step !== 'EDITING',
    refetchInterval: false,
  })

  // 历史列表
  const { data: sessions = [] } = useQuery({
    queryKey: ['prd-sessions'],
    queryFn: listSessions,
  })

  // 创建会话 mutation
  const createMut = useMutation({ mutationFn: createSession })

  // 删除 mutation
  const deleteMut = useMutation({
    mutationFn: deleteSession,
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      // 只有删的是当前激活的会话才 reset，避免删历史条目时中断正在进行的工作
      if (sessionId === deletedId) {
        handleReset()
      }
    },
  })

  const handleReset = () => {
    abortRef.current?.()
    abortRef.current = null
    setStep('INPUT')
    setSessionId(null)
    setStreamText('')
    setPrdContent('')
    setErrorMsg(null)
    setGenerationFailed(false)
    setReqContextTitle(null)
    autoStartedRef.current = false
  }

  /** Step INPUT → 创建会话 → 进入多轮对话澄清 */
  const handleStart = async (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS' = 'PRODUCT') => {
    setErrorMsg(null)
    setSessionTitle(title)
    setSearchParams({}, { replace: true })
    const created = await createMut.mutateAsync({ title, rawInput, project, module, role })
    setSessionId(created.id)
    setStreamText('')
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
    setStep('CHATTING')   // 直接进入对话澄清（ChattingPanel 挂载后自动开始第一题）
  }

  /**
   * 启动 PRD 生成 SSE，可复用于初次生成和重试。
   * 不改变 step（调用方负责设置 GENERATING）。
   */
  const startGenerateSse = (sid: string) => {
    setGenerationFailed(false)
    setStreamText('')
    prdAccRef.current = ''

    const abort = startGenerate(sid, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const chunk = (data as { content: string }).content ?? ''
          prdAccRef.current += chunk
          setStreamText((t) => t + chunk)
        }
        if (name === 'done') {
          setPrdContent(prdAccRef.current)
          qc.invalidateQueries({ queryKey: ['prd-sessions'] })
          if (urlReqItemId && sid) {
            linkPrdToReqItem(urlReqItemId, sid).catch(() => {})
          }
          setStep('EDITING')
        }
        if (name === 'error') {
          const d = data as { message: string }
          setErrorMsg(d.message ?? 'PRD 生成失败，可点击重试')
          // 不改 step！保持 GENERATING 步骤，显示重试按钮
          setGenerationFailed(true)
        }
      },
      onError() {
        setErrorMsg('SSE 连接失败，请点击重试')
        setGenerationFailed(true)
      },
    })
    abortRef.current = abort
  }

  /**
   * ChattingPanel 完成所有轮次后回调。
   * 1. 保存问答历史到数据库
   * 2. 启动 SSE 生成 PRD
   */
  const handleChattingDone = async (history: QaPair[]) => {
    if (!sessionId) return
    setErrorMsg(null)
    setGenerationFailed(false)
    qaHistoryRef.current = history

    try {
      await saveQaHistory(sessionId, history)
    } catch {
      // 保存失败不阻断流程
    }

    setStep('GENERATING')
    startGenerateSse(sessionId)
  }

  /** 重试 PRD 生成（超时/失败后用户点击重试） */
  const handleRetryGenerate = () => {
    if (!sessionId) return
    setErrorMsg(null)
    startGenerateSse(sessionId)
  }

  /** 从历史记录恢复会话 */
  const handleSelectHistory = (s: PrdSessionView) => {
    abortRef.current?.()
    abortRef.current = null
    setSessionId(s.id)
    setStreamText('')
    setErrorMsg(null)

    if (s.status === 'DONE') {
      // 拉取文件内容，进入编辑器；即使内容为空或读取失败也进入编辑器（不强制跳 INPUT）
      getContent(s.id)
        .then((content) => {
          setPrdContent(content ?? '')
          setStep('EDITING')
        })
        .catch(() => {
          // 文件读取失败（如文件被删、网络错误）：进入空编辑器并提示，仍可重新生成
          setPrdContent('')
          setStep('EDITING')
          setErrorMsg('PRD 文件读取失败，可点击「开始开发」使用当前编辑器内容，或重新生成')
        })
    } else if (s.status === 'CLARIFYING') {
      setStep('CHATTING')   // 重新进入对话澄清（会从头开始，历史在 DB 里但前端重新问）
    } else if (s.status === 'GENERATING') {
      setStep('GENERATING')
    } else if (s.status === 'ERROR') {
      setErrorMsg(s.errorMsg ?? '上次执行出错')
      setStep('INPUT')
    } else {
      setStep('INPUT')
    }
  }

  // 澄清记录：优先从 session.questions 读取（已持久化），降级用 qaHistoryRef
  const clarifyQuestions: QuestionItem[] = session?.questions?.length
    ? session.questions
    : qaHistoryRef.current.map((qa, i) => ({ id: i + 1, question: qa.question, answer: qa.answer }))

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--color-background)]">
      {/* 步骤条：在第 3 步时，第 2 步可点击查看澄清记录 */}
      <StepBar
        step={step}
        onClickStep={(idx) => {
          if (idx === 1) setShowClarifyHistory(true)  // 点击第 2 步 → 打开澄清记录抽屉
        }}
      />

      {/* 澄清记录抽屉 */}
      {showClarifyHistory && (
        <ClarifyHistorySheet
          questions={clarifyQuestions}
          onClose={() => setShowClarifyHistory(false)}
        />
      )}

      {/* 来自需求管理池的上下文条 */}
      {reqContextTitle && step !== 'INPUT' && (
        <div className="flex items-center gap-2 px-5 py-1.5 bg-[var(--color-primary)]/8 border-b border-[var(--color-primary)]/15 text-xs text-[var(--color-primary)]">
          <Layers className="w-3 h-3 flex-shrink-0" />
          <span>来自需求管理池：<strong>{reqContextTitle}</strong></span>
          <button
            onClick={() => navigate('/tools/reqpool')}
            className="ml-auto underline opacity-70 hover:opacity-100"
          >
            返回需求池
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-900">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-xs underline">关闭</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* 历史侧边栏（非编辑器、非对话模式下显示） */}
        {step !== 'EDITING' && step !== 'CHATTING' && (
          <HistoryPanel
            sessions={sessions}
            activeId={sessionId}
            onSelect={handleSelectHistory}
            onDelete={(id) => deleteMut.mutate(id)}
          />
        )}

        {/* 主内容区 */}
        {step === 'INPUT' && (
          <InputPanel
            onStart={handleStart}
            initialTitle={urlTitle}
            initialRawInput={urlRawInput}
            initialProject={urlProject}
            initialModule={urlModule}
          />
        )}

        {/* 多轮渐进澄清对话（ChattingPanel 自管理 askNextQuestion 循环） */}
        {step === 'CHATTING' && sessionId && (
          <ChattingPanel
            sessionId={sessionId}
            onDone={handleChattingDone}
            onError={(msg) => { setErrorMsg(msg); setStep('INPUT') }}
          />
        )}

        {step === 'GENERATING' && (
          <GeneratingPanel
            streamText={streamText}
            failed={generationFailed}
            onRetry={handleRetryGenerate}
          />
        )}

        {step === 'EDITING' && sessionId && (
          <EditingPanel
            sessionId={sessionId}
            sessionTitle={sessionTitle || session?.title || 'PRD 文档'}
            initialContent={prdContent}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
