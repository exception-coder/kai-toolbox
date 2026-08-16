import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  AtSign,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  Database,
  FileText,
  Filter,
  Gauge,
  GitBranch,
  GripVertical,
  LayoutList,
  Lightbulb,
  ListTree,
  Loader2,
  PanelRightOpen,
  Play,
  Plus,
  Presentation,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  TableProperties,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  UserX,
  Wand2,
  Workflow,
  X,
} from 'lucide-react'
import {
  analyzeItem,
  assignItem,
  deleteItem,
  deleteItems,
  listAssignableUsers,
  listItems,
  portfolioAnalyze,
  seedDemo,
  startClarify,
  syncFromPrd,
  updateItem,
} from '../api'
import type { AssignableUser, ReqItemView, ReqStatus } from '../types'
import { evaluateRequirementFacts, type FactQualityResult } from '../factQuality'
import {
  DeliveryStageDialog,
  GenerationSupplementDialog,
  getDeliveryOverview,
  requirementProgress,
  type DeliveryOverview,
  type DeliveryRequirement,
  type ProgressItem,
} from '@/features/delivery-center/public-api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { QuickRequirementDialog } from '../components/QuickRequirementDialog'
import { ReqpoolVibeDialog } from '../components/ReqpoolVibeDialog'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getSelfRepo, useChatRuntime } from '@/features/claude-chat/public-api'
import {
  getContent as getPrdContent,
  getDevDocContent,
  estimateDevDocEffort,
  evaluateProgress as runCodeProgressAnalysis,
  generateDevDocQuestions,
  getSession as getPrdSession,
  listDevDocVersions,
  listSessions as listPrdSessions,
  saveQaHistory,
  startClarify as runPrdClarify,
  startClarifyFromDraft,
  startGenerateDevDoc,
  startGenerate as runPrdGenerate,
  documentProfileLabels,
  type AgentEngine,
  type PrdSessionView,
  type QaPair,
  StartDevelopmentDialog,
} from '@/features/prd-clarify/public-api'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import { useAuth } from '@/lib/auth'

type ViewMode = 'table' | 'leader'
type Decision = 'NOW' | 'CLARIFY' | 'PLAN' | 'PARK'
type Density = 'comfortable' | 'compact'

interface AiInsight {
  priority?: 'STRATEGIC' | 'HIGH' | 'MEDIUM' | 'LOW'
  recommendation?: string
  reason?: string
  impacts?: string[]
  roi?: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedHours?: number
  rank?: number
}

interface DisplayField {
  id: string
  label: string
  description: string
  enabled: boolean
  ai?: boolean
}

const DEFAULT_FIELDS: DisplayField[] = [
  { id: 'decision', label: '统一判定', description: 'AI 按统一规则给出的投入建议', enabled: true, ai: true },
  { id: 'requirement', label: '需求事实', description: '标题、系统模块、URL 定位与事实质量', enabled: true },
  { id: 'value', label: '业务价值', description: '目标、影响与预期收益', enabled: true, ai: true },
  { id: 'owner', label: '责任与时间', description: '唯一负责人和承诺时间', enabled: true },
  { id: 'delivery', label: '交付证据', description: '需求规格、执行方案、代码自动回填', enabled: true, ai: true },
  { id: 'risk', label: '风险与下一步', description: '阻塞、缺口与明确动作', enabled: true, ai: true },
]

const VIEW_PREFERENCE_KEY = 'kai-reqpool-view-preference-v1'

type ReqpoolVibeEngine = 'codex' | 'claude'

function buildReqpoolVibeSeed(ask: string): string {
  return [
    '你正在通过 kai-toolbox 的“AI 需求中枢”发起一次页面级 Vibe Coding 调整。',
    '',
    '【不可放宽的写入边界】',
    '- 唯一允许修改：当前工作目录 frontend/src/features/reqpool 及其子目录。',
    '- 禁止修改父目录、后端、公共组件、其他业务模块、构建配置、依赖和生成文件。',
    '- 可以只读仓库内其他文件以理解接口；任何写入前都必须确认目标仍在上述目录内。',
    '- 如果需求必须跨出该目录才能实现，停止越界修改，并在对话中说明受限原因和建议方案。',
    '',
    '【本次页面调整】',
    ask.trim(),
    '',
    '直接检查当前实现并完成改动，保留工作区里已有的无关修改。完成后执行与本模块相关的前端类型检查，并用业务语言简要说明页面发生了什么变化。除非存在会改变产品方向的歧义，否则不需要先让我确认方案。',
  ].join('\n')
}

function loadViewPreference(): { fields: DisplayField[]; density: Density } {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_PREFERENCE_KEY) ?? '{}') as {
      fields?: DisplayField[]
      density?: Density
    }
    const savedById = new Map(saved.fields?.map(field => [field.id, field]))
    return {
      fields: DEFAULT_FIELDS.map(field => ({ ...field, enabled: savedById.get(field.id)?.enabled ?? field.enabled })),
      density: saved.density === 'compact' ? 'compact' : 'comfortable',
    }
  } catch {
    return { fields: DEFAULT_FIELDS, density: 'comfortable' }
  }
}

const STATUS_META: Record<ReqStatus, { label: string; cls: string }> = {
  DRAFT: { label: '待受理', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  CLARIFYING: { label: '澄清中', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  PRD_READY: { label: '已准入', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  IN_DEV: { label: '交付中', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  DONE: { label: '已交付', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  CANCELLED: { label: '已归档', cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' },
}

const DECISION_META: Record<Decision, { label: string; hint: string; cls: string; dot: string }> = {
  NOW: { label: '建议投入', hint: '价值明确 · 当前推进', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900', dot: 'bg-emerald-500' },
  CLARIFY: { label: '补充信息', hint: '判定条件尚不完整', cls: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900', dot: 'bg-amber-500' },
  PLAN: { label: '进入排期', hint: '价值成立 · 等待产能', cls: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950/40 dark:border-sky-900', dot: 'bg-sky-500' },
  PARK: { label: '暂不投入', hint: '收益不足或已关闭', cls: 'text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-900 dark:border-slate-700', dot: 'bg-slate-400' },
}

function parseInsight(value: string | null): AiInsight | null {
  if (!value) return null
  try {
    return JSON.parse(value) as AiInsight
  } catch {
    return null
  }
}

function insightStaleLabel(item: ReqItemView) {
  if (!item.aiInsightStale) return null
  if (item.aiInsightStaleReason === 'SOURCE_CHANGED') return '需求事实已变化，请重新分析'
  if (item.aiInsightStaleReason === 'PORTFOLIO_CHANGED') return '需求组合已变化，请重新排序'
  return '历史洞察未经版本校验，建议重新分析'
}

function effectiveInsight(item: ReqItemView) {
  return item.aiInsightStale ? null : parseInsight(item.aiInsight)
}

function decisionOf(item: ReqItemView): Decision {
  if (item.status === 'CANCELLED') return 'PARK'
  if (item.status === 'DRAFT' || item.status === 'CLARIFYING') return 'CLARIFY'
  const insight = effectiveInsight(item)
  if (insight?.priority === 'STRATEGIC' || insight?.priority === 'HIGH' || item.status === 'IN_DEV') return 'NOW'
  return 'PLAN'
}

function excerpt(value: string | null | undefined, max = 78) {
  const text = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return '尚未形成可验证的业务目标'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function dateLabel(value: string | null) {
  if (!value) return '待承诺'
  return value.replaceAll('-', '.')
}

function relativeTime(value: number) {
  const hours = Math.max(0, Math.floor((Date.now() - value) / 3_600_000))
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

interface RequirementHierarchy {
  roots: ReqItemView[]
  childrenByItemId: Map<string, ReqItemView[]>
}

/**
 * 需求池条目是一份 PRD 会话镜像；PRD 的 parentId 才是权威父子关系。
 * 这里把修订版和拆分子需求重新挂回根需求，避免每个版本被误展示成平级需求。
 */
function buildRequirementHierarchy(
  items: ReqItemView[],
  sessionsById: Map<string, PrdSessionView>,
  overview?: DeliveryOverview,
): RequirementHierarchy {
  const itemByPrdSessionId = new Map(items
    .filter((item): item is ReqItemView & { prdSessionId: string } => !!item.prdSessionId)
    .map(item => [item.prdSessionId, item]))
  const deliveryById = new Map(overview?.requirements.map(requirement => [requirement.id, requirement]) ?? [])
  const childrenByItemId = new Map<string, ReqItemView[]>()
  const childIds = new Set<string>()

  for (const item of items) {
    if (!item.prdSessionId) continue
    const parentPrdSessionId = sessionsById.get(item.prdSessionId)?.parentId
      ?? deliveryById.get(item.prdSessionId)?.parentId
    const parentItem = parentPrdSessionId ? itemByPrdSessionId.get(parentPrdSessionId) : undefined
    if (!parentItem || parentItem.id === item.id) continue
    const siblings = childrenByItemId.get(parentItem.id) ?? []
    siblings.push(item)
    childrenByItemId.set(parentItem.id, siblings)
    childIds.add(item.id)
  }

  for (const children of childrenByItemId.values()) {
    children.sort((left, right) => left.createdAt - right.createdAt)
  }
  return {
    roots: items.filter(item => !childIds.has(item.id)),
    childrenByItemId,
  }
}

function branchSome(
  item: ReqItemView,
  childrenByItemId: Map<string, ReqItemView[]>,
  predicate: (candidate: ReqItemView) => boolean,
): boolean {
  return predicate(item)
    || (childrenByItemId.get(item.id) ?? []).some(child => branchSome(child, childrenByItemId, predicate))
}

function descendantCount(itemId: string, childrenByItemId: Map<string, ReqItemView[]>): number {
  return (childrenByItemId.get(itemId) ?? []).reduce(
    (total, child) => total + 1 + descendantCount(child.id, childrenByItemId),
    0,
  )
}

function deliveryFor(item: ReqItemView, overview?: DeliveryOverview) {
  if (!item.prdSessionId || !overview) return undefined
  return overview.requirements.find(requirement => requirement.id === item.prdSessionId)
}

function stageState(requirement: DeliveryRequirement | undefined, stage: 'prd' | 'tdd' | 'code') {
  if (!requirement) return 'empty'
  const status = requirement.stages[stage].status
  if (status === 'COMPLETE') return 'done'
  if (status === 'PARTIAL' || status === 'STALE') return 'active'
  return 'empty'
}


export function PrdQuestionsModal({ item, session, onClose, onSubmit }: {
  item: ReqItemView
  session: PrdSessionView
  onClose: () => void
  onSubmit: (history: QaPair[], extraInstructions?: string) => Promise<void>
}) {
  const [answers, setAnswers] = useState<string[]>(() => session.questions.map(question => question.answer ?? ''))
  const [submitting, setSubmitting] = useState(false)
  const [supplementOpen, setSupplementOpen] = useState(false)
  const [error, setError] = useState('')
  const answeredCount = answers.filter(answer => answer.trim()).length
  const allAnswered = session.questions.length > 0 && answeredCount === session.questions.length

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting && !supplementOpen) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, submitting, supplementOpen])

  const submit = () => {
    if (!allAnswered || submitting) return
    setSupplementOpen(true)
  }

  const confirmSubmit = async (extraInstructions: string) => {
    if (!allAnswered || submitting) return
    setSupplementOpen(false)
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(
        session.questions.map((question, index) => ({ question: question.question, answer: answers[index].trim() })),
        extraInstructions || undefined,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交澄清回答失败')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:p-4" onMouseDown={event => !submitting && event.target === event.currentTarget && onClose()}>
      <section className="flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:h-[min(88vh,920px)] sm:rounded-2xl">
        <header className="shrink-0 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/35 dark:text-amber-300"><Sparkles className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-950/35 dark:text-amber-300">待回答</span><span className="text-[10px] text-[var(--color-muted-foreground)]">{answeredCount} / {session.questions.length} 已填写</span></div>
              <h2 className="mt-1 truncate text-sm font-semibold">{item.title}</h2>
              <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">逐项补齐业务事实，提交后将在后台继续生成 PRD。</p>
            </div>
            <button type="button" disabled={submitting} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40" aria-label="关闭澄清问题"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]"><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${session.questions.length ? Math.round(answeredCount / session.questions.length * 100) : 0}%` }} /></div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)]/35 p-4 sm:p-5">
          <div className="space-y-3">
            {session.questions.map((question, index) => (
              <article key={question.id ?? index} className={`overflow-hidden rounded-xl border bg-[var(--color-card)] transition-colors ${answers[index]?.trim() ? 'border-emerald-300 dark:border-emerald-900' : 'border-amber-300 dark:border-amber-900'}`}>
                <div className="flex items-start gap-3 border-b border-[var(--color-border)] bg-[var(--color-muted)]/35 px-4 py-3">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${answers[index]?.trim() ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{answers[index]?.trim() ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  <p className="text-xs font-medium leading-5">{question.question}</p>
                </div>
                <textarea value={answers[index] ?? ''} onChange={event => setAnswers(current => current.map((value, answerIndex) => answerIndex === index ? event.target.value : value))} rows={3} placeholder="填写明确、可验证的回答…" className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-6 outline-none placeholder:text-[var(--color-muted-foreground)]/60" />
              </article>
            ))}
          </div>
        </div>

        <footer className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[10px] text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-[var(--color-muted-foreground)]">{allAnswered ? '全部问题已填写，可以提交并生成 PRD。' : `还有 ${session.questions.length - answeredCount} 个问题未回答。`}</p>
            <button type="button" disabled={!allAnswered || submitting} onClick={submit} className="flex shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{submitting ? '正在提交…' : '下一步：补充并生成'}</button>
          </div>
        </footer>
      </section>
      {supplementOpen && (
        <GenerationSupplementDialog
          kind="PRD"
          onClose={() => setSupplementOpen(false)}
          onConfirm={extraInstructions => void confirmSubmit(extraInstructions)}
        />
      )}
    </div>
  )
}

function MarkdownOutline({ content, targetRef }: {
  content: string
  targetRef: React.RefObject<HTMLDivElement | null>
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const headings = useMemo(() => content.split('\n').flatMap(line => {
    const match = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/)
    if (!match) return []
    return [{
      level: match[1].length,
      text: match[2]
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim(),
    }]
  }), [content])

  const scrollTo = (index: number) => {
    const heading = targetRef.current?.querySelectorAll('h1,h2,h3,h4').item(index)
    if (!heading) return
    setActiveIndex(index)
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold"><ListTree className="h-3.5 w-3.5 text-violet-500" />文档大纲</div>
        <p className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">点击标题定位正文</p>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="Markdown 文档大纲">
        {headings.length === 0 ? (
          <p className="px-4 py-3 text-[10px] text-[var(--color-muted-foreground)]">文档中没有可识别的标题</p>
        ) : headings.map((heading, index) => (
          <button
            key={`${heading.text}-${index}`}
            type="button"
            onClick={() => scrollTo(index)}
            title={heading.text}
            className={`block w-full truncate border-l-2 py-1.5 pr-3 text-left text-[10px] transition-colors hover:bg-[var(--color-muted)]/70 ${activeIndex === index ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/25 dark:text-violet-300' : 'border-transparent text-[var(--color-muted-foreground)]'} ${heading.level === 1 ? 'pl-3 font-semibold' : heading.level === 2 ? 'pl-5 font-medium' : heading.level === 3 ? 'pl-7' : 'pl-9'}`}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </aside>
  )
}
export function MarkdownDocumentModal({ item, kind, onClose, onOpenFull }: {
  item: ReqItemView
  kind: 'PRD' | 'TDD'
  onClose: () => void
  onOpenFull?: () => void
}) {
  const [outlineOpen, setOutlineOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640)
  const contentRef = useRef<HTMLDivElement>(null)
  const contentQuery = useQuery({
    queryKey: [kind === 'PRD' ? 'prd-content' : 'tdd-content', item.prdSessionId],
    queryFn: () => kind === 'PRD' ? getPrdContent(item.prdSessionId!) : getDevDocContent(item.prdSessionId!),
    enabled: !!item.prdSessionId,
  })

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="flex h-full w-full max-w-6xl flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:h-[min(86vh,900px)] sm:rounded-2xl">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/35 dark:text-emerald-300"><FileText className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300">{kind} 已输出</span><span className="text-[10px] text-[var(--color-muted-foreground)]">Markdown 预览</span></div>
            <h2 className="mt-1 truncate text-sm font-semibold">{item.title}</h2>
          </div>
          <button type="button" onClick={() => setOutlineOpen(value => !value)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-medium transition-colors ${outlineOpen ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300' : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]'}`} aria-expanded={outlineOpen}><ListTree className="h-3.5 w-3.5" />{outlineOpen ? '收起大纲' : '展示大纲'}</button>
          {onOpenFull && <button type="button" onClick={onOpenFull} className="hidden items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[10px] font-medium hover:bg-[var(--color-muted)] sm:flex"><ArrowUpRight className="h-3.5 w-3.5" />在 PRD 工作台打开</button>}
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]" aria-label={`关闭 ${kind} 预览`}><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 bg-[var(--color-background)]/35">
          {contentQuery.isLoading ? (
            <div className="grid h-full place-items-center"><div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />正在读取 {kind} 文档…</div></div>
          ) : contentQuery.isError ? (
            <div className="grid h-full place-items-center p-8 text-center"><div><AlertTriangle className="mx-auto h-6 w-6 text-rose-500" /><p className="mt-3 text-sm font-medium">{kind} 文档读取失败</p><button type="button" onClick={() => void contentQuery.refetch()} className="mt-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-[var(--color-muted)]">重新加载</button></div></div>
          ) : (
            <div className="relative flex h-full min-h-0">
              {outlineOpen && <div className="absolute inset-y-0 left-0 z-10 shadow-xl sm:static sm:shadow-none"><MarkdownOutline content={contentQuery.data || ''} targetRef={contentRef} /></div>}
              <div className="min-w-0 flex-1 overflow-hidden">
                <MarkdownContent content={contentQuery.data || `暂无 ${kind} 内容`} containerRef={contentRef} className="scroll-pt-6 px-6 py-7 sm:px-10" />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}


