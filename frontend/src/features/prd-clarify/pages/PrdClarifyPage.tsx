import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Copy, FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { http } from '@/lib/api'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  createSession,
  deleteSession,
  getContent,
  getSession,
  listSessions,
  saveContent,
  startClarify,
  startGenerate,
  submitAnswers,
} from '../api'
import type { PrdSessionView, PrdStep, QuestionItem } from '../types'
import { useConfirm } from '@/components/ui/confirm-dialog'

// 编辑器 lazy import — CodeMirror chunk 只在进入 EDITING 步骤时加载
const MarkdownEditor = lazy(() =>
  import('@/features/doc-viewer/components/MarkdownEditor').then((m) => ({
    default: m.MarkdownEditor,
  }))
)

// ───── 内联 Markdown 预览（用 marked + DOMPurify，无额外依赖） ─────
function MarkdownViewer({ content }: { content: string }) {
  const html = DOMPurify.sanitize(marked.parse(content, { async: false }) as string)
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none h-full overflow-y-auto p-4 text-sm"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ───── 步骤指示器 ─────
const STEP_LABELS = ['填写需求', '澄清问答', '生成 / 编辑 PRD']
function stepIndex(step: PrdStep): number {
  if (step === 'INPUT') return 0
  if (step === 'CLARIFYING' || step === 'ANSWERING') return 1
  return 2
}

function StepBar({ step }: { step: PrdStep }) {
  const active = stepIndex(step)
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-card)]">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
              ${i <= active
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}
          >
            {i + 1}
          </div>
          <span className={`text-sm ${i === active ? 'font-medium' : 'text-[var(--color-muted-foreground)]'}`}>
            {label}
          </span>
          {i < STEP_LABELS.length - 1 && (
            <ChevronRight className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          )}
        </div>
      ))}
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
              <div className={`text-[10px] ${statusColor[s.status] ?? 'text-[var(--color-muted-foreground)]'}`}>
                {s.status}
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

// ───── 表单（Step INPUT） ─────
function InputPanel({
  onStart,
}: {
  onStart: (title: string, rawInput: string, project: string, module: string) => void
}) {
  const [title, setTitle] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [project, setProject] = useState('')
  const [module, setModule] = useState('')

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
            <select
              value={project}
              onChange={(e) => { setProject(e.target.value); setModule('') }}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            >
              <option value="">-- 不关联项目 --</option>
              {projects.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">关联模块（可选）</label>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value)}
              disabled={!project || modules.length === 0}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)] disabled:opacity-50"
            >
              <option value="">-- 不关联模块 --</option>
              {modules.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">原始需求描述 <span className="text-red-500">*</span></label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={8}
            placeholder="详细描述你的产品需求，越具体越好。Claude 会基于此生成澄清问题。"
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
        </div>

        <button
          disabled={!canSubmit}
          onClick={() => onStart(title.trim(), rawInput.trim(), project, module)}
          className="w-full py-2.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          开始需求澄清
        </button>
      </div>
    </div>
  )
}

// ───── 流式展示面板（澄清阶段 / 生成阶段） ─────
function StreamingPanel({ streamText, label }: { streamText: string; label: string }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamText])

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      <div className="flex items-center gap-2 mb-4 text-sm text-[var(--color-muted-foreground)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{label}</span>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-[var(--color-muted)]/30 p-4 font-mono text-sm whitespace-pre-wrap break-words leading-relaxed">
        {streamText || <span className="text-[var(--color-muted-foreground)] italic">等待 Claude 响应…</span>}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ───── 澄清答题面板（Step ANSWERING） ─────
function AnsweringPanel({
  questions,
  onSubmit,
}: {
  questions: QuestionItem[]
  onSubmit: (answers: string[]) => void
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map((q) => q.answer ?? ''))
  const allFilled = answers.every((a) => a.trim().length > 0)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-[var(--color-muted-foreground)] mb-5">
          Claude 提出了以下澄清问题，请逐一填写答案，帮助生成更精准的 PRD。
        </p>
        <div className="space-y-5">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-[var(--color-border)] p-4">
              <div className="text-sm font-medium mb-2">
                <span className="text-[var(--color-primary)] mr-1">Q{i + 1}.</span>
                {q.question}
              </div>
              <textarea
                value={answers[i] ?? ''}
                onChange={(e) => {
                  const next = [...answers]
                  next[i] = e.target.value
                  setAnswers(next)
                }}
                rows={3}
                placeholder="请填写您的答案…"
                className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              />
            </div>
          ))}
        </div>
        <button
          disabled={!allFilled}
          onClick={() => onSubmit(answers)}
          className="mt-6 w-full py-2.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          提交答案并生成 PRD
        </button>
      </div>
    </div>
  )
}

// ───── 编辑器面板（Step EDITING） ─────
function EditingPanel({
  sessionId,
  initialContent,
  onReset,
}: {
  sessionId: string
  initialContent: string
  onReset: () => void
}) {
  const [content, setContent] = useState(initialContent)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split')

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
  const qc = useQueryClient()
  const [step, setStep] = useState<PrdStep>('INPUT')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streamText, setStreamText] = useState('')
  const [prdContent, setPrdContent] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const abortRef = useRef<(() => void) | null>(null)
  // GENERATING 阶段用 ref 积累 PRD 内容（不触发渲染），done 时一次性赋值 prdContent
  const prdAccRef = useRef('')

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

  // 提交答案 mutation
  const answerMut = useMutation({ mutationFn: ({ id, answers }: { id: string; answers: string[] }) =>
    submitAnswers(id, { answers })
  })

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
  }

  /** Step INPUT → 创建会话 → 启动 SSE 澄清 */
  const handleStart = async (title: string, rawInput: string, project: string, module: string) => {
    setErrorMsg(null)
    const created = await createMut.mutateAsync({ title, rawInput, project, module })
    setSessionId(created.id)
    setStreamText('')
    setStep('CLARIFYING')

    qc.invalidateQueries({ queryKey: ['prd-sessions'] })

    // 启动澄清 SSE
    const abort = startClarify(created.id, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const d = data as { content: string }
          setStreamText((t) => t + (d.content ?? ''))
        }
        if (name === 'done') {
          // 等待 questions 刷新完再切步骤，避免 ANSWERING 面板闪现空列表
          qc.refetchQueries({ queryKey: ['prd-session', created.id] }).then(() => {
            setStep('ANSWERING')
          })
        }
        if (name === 'error') {
          const d = data as { message: string }
          setErrorMsg(d.message ?? '澄清失败')
          setStep('INPUT')
        }
      },
      onError() {
        setErrorMsg('SSE 连接失败，请重试')
        setStep('INPUT')
      },
    })
    abortRef.current = abort
  }

  /** Step ANSWERING → 提交答案 → 启动 SSE 生成 */
  const handleSubmitAnswers = async (answers: string[]) => {
    if (!sessionId) return
    setErrorMsg(null)

    await answerMut.mutateAsync({ id: sessionId, answers })

    setStreamText('')
    prdAccRef.current = '' // 重置 PRD 积累器
    setStep('GENERATING')

    const abort = startGenerate(sessionId, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const d = data as { content: string }
          const chunk = d.content ?? ''
          prdAccRef.current += chunk      // 无渲染开销积累全文
          setStreamText((t) => t + chunk) // 流式展示用 state
        }
        if (name === 'done') {
          setPrdContent(prdAccRef.current) // 一次性赋值，不双重 setState
          qc.invalidateQueries({ queryKey: ['prd-sessions'] })
          setStep('EDITING')
        }
        if (name === 'error') {
          const d = data as { message: string }
          setErrorMsg(d.message ?? 'PRD 生成失败')
          setStep('ANSWERING')
        }
      },
      onError() {
        setErrorMsg('SSE 连接失败，请重试')
        setStep('ANSWERING')
      },
    })
    abortRef.current = abort
  }

  /** 从历史记录恢复会话 */
  const handleSelectHistory = (s: PrdSessionView) => {
    abortRef.current?.()
    abortRef.current = null
    setSessionId(s.id)
    setStreamText('')
    setErrorMsg(null)

    if (s.status === 'DONE') {
      // 拉取文件内容，进入编辑器
      getContent(s.id)
        .then((content) => {
          setPrdContent(content ?? '')
          setStep('EDITING')
        })
        .catch(() => {
          setErrorMsg('读取 PRD 文件失败，文件可能已被删除')
          setStep('INPUT')
        })
    } else if (s.status === 'CLARIFYING') {
      setStep('ANSWERING')
    } else if (s.status === 'GENERATING') {
      // 正在生成，进入空流状态
      setStep('GENERATING')
    } else if (s.status === 'ERROR') {
      setErrorMsg(s.errorMsg ?? '上次执行出错')
      setStep('INPUT')
    } else {
      setStep('INPUT')
    }
  }

  const questions: QuestionItem[] = session?.questions ?? []

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--color-background)]">
      <StepBar step={step} />

      {/* 错误提示 */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-900">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-xs underline">
            关闭
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* 历史侧边栏（非编辑器模式下显示） */}
        {step !== 'EDITING' && (
          <HistoryPanel
            sessions={sessions}
            activeId={sessionId}
            onSelect={handleSelectHistory}
            onDelete={(id) => deleteMut.mutate(id)}
          />
        )}

        {/* 主内容区 */}
        {step === 'INPUT' && (
          <InputPanel onStart={handleStart} />
        )}

        {step === 'CLARIFYING' && (
          <StreamingPanel streamText={streamText} label="Claude 正在分析需求，生成澄清问题…" />
        )}

        {step === 'ANSWERING' && (
          <AnsweringPanel
            questions={questions}
            onSubmit={handleSubmitAnswers}
          />
        )}

        {step === 'GENERATING' && (
          <StreamingPanel streamText={streamText} label="Claude 正在撰写 PRD 文档…" />
        )}

        {step === 'EDITING' && sessionId && (
          <EditingPanel
            sessionId={sessionId}
            initialContent={prdContent}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
