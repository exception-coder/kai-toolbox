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
  documentLabels,
  type AgentEngine,
  type PrdSessionView,
  type QaPair,
  StartDevelopmentDialog,
} from '@/features/prd-clarify/public-api'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import { useAuth } from '@/lib/auth'
import { formatCompactTime, formatLifecycleTime, StageDot } from './ReqPoolStagePrimitives'

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
  { id: 'requirement', label: '需求', description: '标题、结论摘要与必要元信息', enabled: true, ai: true },
  { id: 'owner', label: '负责人', description: '唯一负责人和承诺时间', enabled: true },
  { id: 'delivery', label: '交付进度', description: '规格、计划、代码与交付状态', enabled: true, ai: true },
  { id: 'risk', label: '风险', description: '当前最优先处理的一项风险', enabled: true, ai: true },
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


type PrdNodeState = 'draft' | 'building' | 'awaiting' | 'generating' | 'done' | 'error' | 'empty'

function prdNodeState(item: ReqItemView, requirement?: DeliveryRequirement, session?: PrdSessionView): PrdNodeState {
  if (!item.prdSessionId) return 'empty'
  if (session?.status === 'DONE') return 'done'
  if (session?.status === 'DRAFT') return 'draft'
  if (session?.status === 'GENERATING') return 'generating'
  if (session?.status === 'ERROR') return 'error'
  if (session?.status === 'CLARIFYING') return session.questions.length > 0 ? 'awaiting' : 'building'
  const sourceStatus = requirement?.status
  if (sourceStatus === 'DONE' || item.status === 'PRD_READY' || item.status === 'IN_DEV' || item.status === 'DONE') return 'done'
  if (sourceStatus === 'GENERATING') return 'generating'
  if (sourceStatus === 'CLARIFYING' || item.status === 'CLARIFYING') return 'building'
  return 'draft'
}

const PRD_NODE_META: Record<Exclude<PrdNodeState, 'empty'>, { label: string; hint: string }> = {
  draft: { label: '规格草稿', hint: '点击开始需求探索' },
  building: { label: '澄清问题构建中', hint: 'AI 正在生成问题' },
  awaiting: { label: '待回答澄清问题', hint: '点击填写问题卡片' },
  generating: { label: '核心规格生成中', hint: '正在输出规格文档' },
  done: { label: '核心规格已输出', hint: '点击预览 Markdown' },
  error: { label: '规格执行失败', hint: '点击查看失败原因' },
}

function PrdStageDot({ state, running }: { state: PrdNodeState; running: boolean }) {
  if (state === 'done') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"><Check className="h-3 w-3" /></span>
  }
  if (state === 'building') {
    return (
      <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-violet-500 bg-violet-50 dark:bg-violet-950">
        <span className="absolute inset-[-4px] animate-ping rounded-full border border-violet-400/50" />
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
      </span>
    )
  }
  if (state === 'awaiting') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm shadow-amber-500/30">!</span>
  }
  if (state === 'generating') {
    return <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-card)]"><span className="absolute inset-[-4px] animate-ping rounded-full border border-[var(--color-primary)]/40" /><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" /></span>
  }
  if (state === 'draft') {
    return <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-slate-400 bg-slate-50 dark:bg-slate-900"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /></span>
  }
  if (state === 'error') return <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">!</span>
  return <span className="h-5 w-5 rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-background)]" />
}

type TddNodeState = 'locked' | 'ready' | 'building' | 'awaiting' | 'generating' | 'stale' | 'done' | 'error'

function tddNodeState(requirement: DeliveryRequirement | undefined, session: PrdSessionView | undefined, building: boolean, generating: boolean, failed: boolean): TddNodeState {
  if (building) return 'building'
  if (generating) return 'generating'
  if (session?.devDocWorkStatus === 'GENERATING') return 'generating'
  if (failed || session?.devDocWorkStatus === 'ERROR') return 'error'
  if (!requirement || requirement.stages.prd.status !== 'COMPLETE') return 'locked'
  if (requirement.stages.tdd.status === 'COMPLETE') return 'done'
  if (requirement.stages.tdd.status === 'ERROR' || requirement.stages.tddClarify.status === 'ERROR') return 'error'
  if (
    requirement.stages.tdd.status === 'STALE'
    || requirement.stages.tddClarify.status === 'STALE'
    || requirement.stages.tddClarify.status === 'PARTIAL'
  ) return 'stale'
  return 'ready'
}

const TDD_NODE_META: Record<TddNodeState, { label: string; hint: string }> = {
  locked: { label: '执行计划尚不可用', hint: '完成核心规格后可开始技术作业' },
  ready: { label: '执行计划待生成', hint: '点击启动后台生成' },
  building: { label: '执行计划生成中', hint: 'AI 正在后台准备并输出文档' },
  awaiting: { label: '执行计划待生成', hint: '旧技术问答不再阻断，可直接重新生成' },
  generating: { label: '执行计划生成中', hint: 'AI 正在后台输出文档' },
  stale: { label: '执行计划需更新', hint: '上游已变化，点击重新作业' },
  done: { label: '执行计划已输出', hint: '点击预览 Markdown' },
  error: { label: '执行计划执行失败', hint: '点击重新进入技术作业' },
}

function TddStageDot({ state }: { state: TddNodeState }) {
  if (state === 'done') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"><Check className="h-3 w-3" /></span>
  }
  if (state === 'ready') {
    return <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-[var(--color-muted-foreground)] bg-[var(--color-card)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted-foreground)]" /></span>
  }
  if (state === 'building') {
    return <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-violet-500 bg-violet-50 dark:bg-violet-950"><span className="absolute inset-[-4px] animate-ping rounded-full border border-violet-400/50" /><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /></span>
  }
  if (state === 'awaiting') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm shadow-amber-500/30">!</span>
  }
  if (state === 'generating') {
    return <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-card)]"><span className="absolute inset-[-4px] animate-ping rounded-full border border-[var(--color-primary)]/40" /><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" /></span>
  }
  if (state === 'stale') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm shadow-amber-500/30">!</span>
  }
  if (state === 'error') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">!</span>
  }
  return <span className="h-5 w-5 rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-background)]" />
}

function prdRelationLabel(session?: PrdSessionView) {
  if (!session) return '子节点'
  const version = session.title.match(/修订版\s*v(\d+)/i)?.[1]
  if (version) return `修订 V${version}`
  if (session.rawInput?.startsWith('【后台自动修订') || session.rawInput?.startsWith('【修订版 PRD')) return '修订版本'
  return '拆分子需求'
}

export interface RequirementLineageActions {
  onStartPrd: (item: ReqItemView, engine: AgentEngine) => Promise<void>
  onAnswerPrd: (item: ReqItemView) => void
  onPreviewPrd: (item: ReqItemView) => void
  onStartTdd: (item: ReqItemView, engine: AgentEngine) => void
  onAnswerTdd: (item: ReqItemView, requirement: DeliveryRequirement) => void
  onPreviewTdd: (item: ReqItemView) => void
}

export interface RequirementLineageRunState {
  clarifyingPrdIds: Set<string>
  generatingPrdIds: Set<string>
  buildingTddQuestionIds: Set<string>
  generatingTddIds: Set<string>
  failedTddIds: Set<string>
}
export function RequirementLineage({
  parent,
  childrenByItemId,
  sessionsById,
  overview,
  actions,
  runState,
}: {
  parent: ReqItemView
  childrenByItemId: Map<string, ReqItemView[]>
  sessionsById: Map<string, PrdSessionView>
  overview?: DeliveryOverview
  actions: RequirementLineageActions
  runState: RequirementLineageRunState
}) {
  const children = childrenByItemId.get(parent.id) ?? []
  const [expanded, setExpanded] = useState(false)
  if (children.length === 0) return null
  const total = descendantCount(parent.id, childrenByItemId)

  return (
    <div className="rounded-xl border border-violet-200/80 bg-violet-50/45 p-2.5 dark:border-violet-900/70 dark:bg-violet-950/15">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center gap-2 text-left text-[10px] font-semibold text-violet-700 dark:text-violet-300"
        aria-expanded={expanded}
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <GitBranch className="h-3.5 w-3.5" />
        版本 / 子需求关系
        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-violet-600 dark:bg-violet-950/70 dark:text-violet-300">{total} 个节点</span>
        <span className="ml-auto font-normal text-[9px] text-[var(--color-muted-foreground)]">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="mt-2 ml-1.5 border-l border-violet-300/80 pl-3 dark:border-violet-800">
          {children.map(child => (
            <RequirementLineageNode
              key={child.id}
              item={child}
              childrenByItemId={childrenByItemId}
              sessionsById={sessionsById}
              overview={overview}
              actions={actions}
              runState={runState}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RequirementLineageNode({
  item,
  childrenByItemId,
  sessionsById,
  overview,
  actions,
  runState,
}: {
  item: ReqItemView
  childrenByItemId: Map<string, ReqItemView[]>
  sessionsById: Map<string, PrdSessionView>
  overview?: DeliveryOverview
  actions: RequirementLineageActions
  runState: RequirementLineageRunState
}) {
  const session = item.prdSessionId ? sessionsById.get(item.prdSessionId) : undefined
  const requirement = deliveryFor(item, overview)
  const children = childrenByItemId.get(item.id) ?? []
  const prdSessionId = item.prdSessionId
  const prdRunning = !!prdSessionId && (runState.clarifyingPrdIds.has(prdSessionId) || runState.generatingPrdIds.has(prdSessionId))
  const tddBuilding = !!prdSessionId && runState.buildingTddQuestionIds.has(prdSessionId)
  const tddGenerating = !!prdSessionId && runState.generatingTddIds.has(prdSessionId)
  const tddFailed = !!prdSessionId && runState.failedTddIds.has(prdSessionId)

  return (
    <div className="relative py-1.5 before:absolute before:-left-3 before:top-5 before:w-2.5 before:border-t before:border-violet-300/80 dark:before:border-violet-800">
      <div className="flex w-full flex-col gap-3 rounded-lg border border-transparent bg-white/75 px-2.5 py-2 text-left transition-colors hover:border-violet-200 hover:bg-white dark:bg-black/10 dark:hover:border-violet-900 dark:hover:bg-violet-950/25 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{prdRelationLabel(session)}</span>
            <span className="truncate text-[10px] font-medium">{item.title}</span>
          </div>
          <div className="mt-1 truncate text-[9px] text-[var(--color-muted-foreground)]">{item.project || '待归属'} · {item.module || '待归类'} · {relativeTime(item.updatedAt)}更新</div>
        </div>
        <DeliveryTrack
          item={item}
          requirement={requirement}
          prdSession={session}
          prdRunning={prdRunning}
          tddBuilding={tddBuilding}
          tddGenerating={tddGenerating}
          tddFailed={tddFailed}
          onStartPrd={engine => actions.onStartPrd(item, engine)}
          onAnswerPrd={() => actions.onAnswerPrd(item)}
          onPreviewPrd={() => actions.onPreviewPrd(item)}
          onStartTdd={engine => actions.onStartTdd(item, engine)}
          onAnswerTdd={() => requirement && actions.onAnswerTdd(item, requirement)}
          onPreviewTdd={() => actions.onPreviewTdd(item)}
        />
      </div>
      {children.length > 0 && (
        <div className="ml-3 border-l border-violet-300/80 pl-3 dark:border-violet-800">
          {children.map(child => <RequirementLineageNode key={child.id} item={child} childrenByItemId={childrenByItemId} sessionsById={sessionsById} overview={overview} actions={actions} runState={runState} />)}
        </div>
      )}
    </div>
  )
}
export function DocumentStatusLegend() {
  const [open, setOpen] = useState(false)
  const states: Array<{ state: Exclude<PrdNodeState, 'empty'>; description: string }> = [
    { state: 'draft', description: '尚未启动 AI 澄清，可点击选择引擎并开始。' },
    { state: 'building', description: 'AI 正在后台构建澄清问题，暂时无需操作。' },
    { state: 'awaiting', description: '澄清问题已经返回，点击节点填写问题卡片。' },
    { state: 'generating', description: '需求上下文已经确认，AI 正在生成核心规格。' },
    { state: 'done', description: '核心规格已输出，点击节点直接预览文档。' },
    { state: 'error', description: '澄清或文档生成失败，点击节点查看原因。' },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button type="button" onClick={() => setOpen(value => !value)} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 text-[10px] font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]" aria-label="查看文档节点状态说明">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          文档节点状态
        </button>
      </PopoverAnchor>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-xs font-semibold">核心规格 / 执行计划节点颜色说明</div>
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">颜色表示当前需要等待、处理还是查看结果；节点均可直接点按。</p>
        </div>
        <div className="max-h-[65vh] space-y-0.5 overflow-y-auto p-2">
          <div className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">核心规格</div>
          {states.map(({ state, description }) => (
            <div key={state} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-[var(--color-muted)]/60">
              <span className="mt-0.5 shrink-0"><PrdStageDot state={state} running={false} /></span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold">{PRD_NODE_META[state].label}</div>
                <p className="mt-0.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">{description}</p>
              </div>
            </div>
          ))}
          <div className="mx-2 my-2 border-t border-[var(--color-border)]" />
          <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">执行计划</div>
          {(['locked', 'ready', 'building', 'awaiting', 'generating', 'stale', 'done', 'error'] as TddNodeState[]).map(state => (
            <div key={state} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-[var(--color-muted)]/60">
              <span className="mt-0.5 shrink-0"><TddStageDot state={state} /></span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold">{TDD_NODE_META[state].label.replace('TDD ', '')}</div>
                <p className="mt-0.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">{TDD_NODE_META[state].hint}</p>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DocumentLifecycleTimeline({
  kind,
  session,
}: {
  kind: 'PRD' | 'TDD'
  session?: PrdSessionView
}) {
  const labels = documentLabels
  const legacyPrdOutput = !session?.prdGeneratedAt && session?.mdPath && session.status === 'DONE'
    ? session.updatedAt
    : null
  const events = kind === 'PRD'
    ? [
        { label: '需求登记', time: session?.createdAt, pending: '等待登记' },
        {
          label: '澄清问题生成完成',
          time: session?.prdQuestionsGeneratedAt,
          pending: session?.status === 'CLARIFYING' && session.questions.length === 0 ? '生成中' : '尚未生成',
        },
        {
          label: `完成澄清并输出${labels.specification}`,
          time: session?.prdGeneratedAt ?? legacyPrdOutput,
          pending: session?.status === 'GENERATING' ? '生成中' : '尚未输出',
          inferred: !!legacyPrdOutput,
        },
      ]
    : [
        {
          label: '执行计划生成启动',
          time: session?.devDocQuestionsGeneratedAt ?? session?.devDocGeneratedAt,
          pending: session?.devDocWorkStatus === 'GENERATING' ? '执行中' : '尚未启动',
        },
        {
          label: `完成并输出${labels.plan}`,
          time: session?.devDocGeneratedAt,
          pending: session?.devDocWorkStatus === 'GENERATING' ? '生成中' : '尚未输出',
        },
      ]

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
        <Clock3 className="h-3 w-3" />{kind === 'PRD' ? labels.specification : labels.plan}作业时间线
      </div>
      <ol className="space-y-0">
        {events.map((event, index) => {
          const completed = typeof event.time === 'number' && event.time > 0
          return (
            <li key={event.label} className="relative flex gap-2.5 pb-2.5 last:pb-0">
              {index < events.length - 1 && <span className={`absolute left-[5px] top-3 h-[calc(100%-4px)] w-px ${completed ? 'bg-emerald-300 dark:bg-emerald-800' : 'bg-[var(--color-border)]'}`} />}
              <span className={`relative mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${completed ? 'border-emerald-500 bg-emerald-500' : event.pending === '生成中' ? 'animate-pulse border-sky-500 bg-sky-500' : 'border-[var(--color-border)] bg-[var(--color-card)]'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium leading-4">{event.label}</div>
                <div className={`text-[9px] leading-4 ${completed ? 'tabular-nums text-[var(--color-muted-foreground)]' : event.pending === '生成中' ? 'text-sky-600' : 'text-[var(--color-muted-foreground)]'}`}>
                  {completed ? formatLifecycleTime(event.time as number) : event.pending}
                  {event.inferred && <span className="ml-1">· 历史时间</span>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ClarificationHistoryDialog({ kind, title, session, onClose }: {
  kind: 'PRD' | 'TDD'
  title: string
  session: PrdSessionView
  onClose: () => void
}) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const versionsQuery = useQuery({
    queryKey: ['prd-dev-doc-versions', session.id, 'clarification-history'],
    queryFn: () => listDevDocVersions(session.id),
    enabled: kind === 'TDD',
    staleTime: 30_000,
  })

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const qaVersions = kind === 'TDD'
    ? (versionsQuery.data ?? []).filter(version => version.qaHistory.length > 0)
    : []
  const activeVersion = qaVersions.find(version => version.version === selectedVersion)
    ?? qaVersions.find(version => version.isCurrent)
    ?? qaVersions.at(-1)
  const records = kind === 'PRD'
    ? session.questions.map(question => ({ question: question.question, answer: question.answer ?? '' }))
    : activeVersion?.qaHistory ?? session.devDocQaDraft
  const answered = records.filter(record => record.answer.trim()).length
  const generatedAt = kind === 'PRD'
    ? session.prdQuestionsGeneratedAt
    : activeVersion?.generatedAt ?? session.devDocQuestionsGeneratedAt

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={`${kind} 澄清记录`} className="flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:h-[min(86vh,860px)] sm:rounded-2xl">
        <header className="shrink-0 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${kind === 'PRD' ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/35' : 'bg-purple-50 text-purple-600 dark:bg-purple-950/35'}`}><ListTree className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{kind} 澄清记录</span><span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[9px] text-[var(--color-muted-foreground)]">{answered} / {records.length} 已回答</span></div>
              <p className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]">{title}</p>
              {generatedAt && <p className="mt-1 text-[9px] tabular-nums text-[var(--color-muted-foreground)]">澄清记录时间：{formatLifecycleTime(generatedAt)}</p>}
            </div>
            <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]" aria-label="关闭澄清记录"><X className="h-4 w-4" /></button>
          </div>
          {kind === 'TDD' && qaVersions.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {qaVersions.map(version => <button key={version.version} type="button" onClick={() => setSelectedVersion(version.version)} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${activeVersion?.version === version.version ? 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-950/35 dark:text-purple-300' : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]'}`}>TDD v{version.version}{version.isCurrent ? ' · 当前' : ''}</button>)}
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)]/35 p-4 sm:p-5">
          {kind === 'TDD' && versionsQuery.isLoading && records.length === 0 ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />正在读取 TDD 澄清记录…</div>
          ) : records.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] text-center text-sm text-[var(--color-muted-foreground)]"><ListTree className="h-6 w-6 opacity-40" /><span>暂无可展示的澄清问答</span></div>
          ) : (
            <div className="space-y-3">
              {records.map((record, index) => {
                const hasAnswer = !!record.answer.trim()
                return (
                  <article key={`${index}-${record.question}`} className={`overflow-hidden rounded-xl border bg-[var(--color-card)] ${hasAnswer ? 'border-emerald-200 dark:border-emerald-900/70' : 'border-amber-200 dark:border-amber-900/70'}`}>
                    <div className="flex items-start gap-3 border-b border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-3">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${hasAnswer ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{hasAnswer ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                      <div className="min-w-0"><div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">问题 {index + 1}</div><p className="text-xs font-medium leading-5">{record.question}</p></div>
                    </div>
                    <div className="px-4 py-3"><div className="mb-1 text-[9px] font-semibold text-[var(--color-muted-foreground)]">回答</div><p className={`whitespace-pre-wrap text-sm leading-6 ${hasAnswer ? 'text-[var(--color-foreground)]' : 'italic text-amber-600'}`}>{hasAnswer ? record.answer : '尚未回答'}</p></div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
        <footer className="shrink-0 border-t border-[var(--color-border)] px-5 py-3 text-right"><button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-medium hover:bg-[var(--color-muted)]">关闭</button></footer>
      </section>
    </div>
  )
}

function PrdStageNode({
  item,
  requirement,
  prdSession,
  running,
  onStart,
  onAnswer,
  onPreview,
  compact = false,
}: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
  running: boolean
  onStart: (engine: AgentEngine) => Promise<void>
  onAnswer: () => void
  onPreview: () => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [engine, setEngine] = useState<AgentEngine>('codex')
  const [startError, setStartError] = useState('')
  const [showClarification, setShowClarification] = useState(false)
  const [pathsCopied, setPathsCopied] = useState(false)
  const [pathCopyError, setPathCopyError] = useState('')
  const state = prdNodeState(item, requirement, prdSession)
  const sessionQuery = useQuery({
    queryKey: ['prd-session', item.prdSessionId],
    queryFn: () => getPrdSession(item.prdSessionId!),
    enabled: open && !!item.prdSessionId,
    refetchInterval: open && (state === 'building' || state === 'generating') ? 2_000 : false,
  })

  const openNode = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (state !== 'empty') setOpen(true)
  }

  const start = async () => {
    setStartError('')
    try {
      await onStart(engine)
      setOpen(false)
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : '启动澄清失败')
    }
  }

  const session = sessionQuery.data ?? prdSession
  const labels = documentLabels
  const meta = {
    ...PRD_NODE_META[state === 'empty' ? 'draft' : state],
    label: state === 'draft'
      ? labels.specificationDraft
      : state === 'generating'
        ? `${labels.specification}生成中`
        : state === 'done'
          ? `${labels.specification}已输出`
          : state === 'error'
            ? `${labels.specification}执行失败`
            : PRD_NODE_META[state === 'empty' ? 'draft' : state].label,
  }
  const questionsReady = (session?.questions.length ?? 0) > 0

  const copyDocumentPaths = async () => {
    if (!session?.mdPath) return
    const paths = [`${labels.specification}：${session.mdPath}`]
    if (session.devDocPath) paths.push(`${labels.plan}（最新）：${session.devDocPath}`)
    try {
      await navigator.clipboard.writeText(paths.join('\n'))
      setPathCopyError('')
      setPathsCopied(true)
      window.setTimeout(() => setPathsCopied(false), 2_000)
    } catch {
      setPathsCopied(false)
      setPathCopyError('复制失败，请检查浏览器剪贴板权限')
    }
  }

  if (state === 'empty') {
    return (
      <div className="flex flex-col items-center gap-1" title={`尚未关联${labels.specification}`}>
        <PrdStageDot state="empty" running={false} />
        <span className="text-[10px] text-[var(--color-muted-foreground)]">{compact ? '规格' : labels.specification}</span>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) { setStartError(''); setPathCopyError(''); setPathsCopied(false) } }}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={openNode}
          className="group/prd flex flex-col items-center gap-1 rounded-md outline-none"
          title={`${meta.label}：${meta.hint}`}
          aria-label={`${meta.label}，${meta.hint}`}
        >
          <PrdStageDot state={state} running={running} />
          <span className={`text-[10px] font-medium transition-colors ${state === 'draft' ? 'text-slate-500' : state === 'building' ? 'text-violet-600' : state === 'awaiting' ? 'text-amber-600' : state === 'generating' ? 'text-sky-600' : state === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>{compact ? '规格' : labels.specification}</span>
        </button>
      </PopoverAnchor>
      {open && (
        <PopoverContent
          className="w-72 p-0"
          side="bottom"
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
        >
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <PrdStageDot state={state} running={running} />
              {meta.label}
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">{item.title}</p>
          </div>

          <DocumentLifecycleTimeline kind="PRD" session={session} />

          {state === 'draft' ? (
            <div className="space-y-3 p-4">
              <p className="text-[11px] leading-5 text-[var(--color-muted-foreground)]">后台异步生成一组待澄清问题；生成期间可继续处理其他需求。</p>
              <div>
                <div className="mb-1.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">执行引擎</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['codex', 'claude'] as const).map(value => (
                    <button key={value} type="button" onClick={() => setEngine(value)} className={`rounded-lg border px-3 py-2 text-[11px] font-medium ${engine === value ? 'border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300' : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]'}`}>
                      {value === 'codex' ? 'Codex（默认）' : 'Claude'}
                    </button>
                  ))}
                </div>
              </div>
              {startError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{startError}</p>}
              <button type="button" disabled={running || sessionQuery.isLoading} onClick={() => void start()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-50">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {running ? '正在启动…' : '开始异步澄清'}
              </button>
            </div>
          ) : state === 'building' ? (
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2.5 text-[11px] text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />AI 正在构建澄清问题，返回后节点会变为橙色。</div>
              <p className="text-[10px] leading-4 text-[var(--color-muted-foreground)]">无需停留在本页面，后台任务会继续执行。</p>
            </div>
          ) : state === 'generating' ? (
            <div className="p-4"><div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-[11px] text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />回答已提交，正在生成{labels.specification} Markdown…</div></div>
          ) : state === 'awaiting' ? (
            <div className="space-y-3 p-4">
              <p className="text-[11px] leading-5 text-[var(--color-muted-foreground)]">澄清问题已返回，完成回答后可补充额外信息并生成{labels.specification}。</p>
              <button type="button" onClick={() => { setOpen(false); onAnswer() }} className="w-full rounded-lg bg-amber-500 px-3 py-2.5 text-xs font-medium text-white hover:bg-amber-600">填写澄清答案</button>
            </div>
          ) : state === 'done' ? (
            <div className="space-y-2 p-4">
              <button type="button" onClick={() => { setOpen(false); onPreview() }} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-emerald-700">预览{labels.specificationDocument}</button>
              {session?.mdPath && (
                <button
                  type="button"
                  onClick={() => void copyDocumentPaths()}
                  title={`PRD：${session.mdPath}${session.devDocPath ? `\nTDD（最新）：${session.devDocPath}` : '\nTDD：尚未生成'}`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]"
                >
                  {pathsCopied ? <CircleCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {pathsCopied ? `${labels.specification} / ${labels.plan}路径已复制` : session.devDocPath ? `复制${labels.specification} / 最新${labels.plan}路径` : `复制${labels.specification}路径（暂无${labels.plan}）`}
                </button>
              )}
              {pathCopyError && <p className="text-center text-[10px] text-rose-600 dark:text-rose-300">{pathCopyError}</p>}
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{session?.errorMsg || '规格执行失败，请稍后重试。'}</p>
              {questionsReady && <button type="button" onClick={onAnswer} className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-xs font-medium text-amber-700 hover:bg-amber-50">返回问题卡片</button>}
            </div>
          )}
          {questionsReady && (
            <div className="border-t border-[var(--color-border)] p-3">
              <button type="button" onClick={() => { setOpen(false); setShowClarification(true) }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]">
                <ListTree className="h-3.5 w-3.5" />查看{labels.specificationClarify}记录
              </button>
            </div>
          )}
        </PopoverContent>
      )}
      {showClarification && session && <ClarificationHistoryDialog kind="PRD" title={item.title} session={session} onClose={() => setShowClarification(false)} />}
    </Popover>
  )
}

function TddStageNode({
  requirement,
  session,
  building,
  generating,
  failed,
  onStart,
  onAnswer: _onAnswer,
  onPreview,
  compact = false,
}: {
  requirement?: DeliveryRequirement
  session?: PrdSessionView
  building: boolean
  generating: boolean
  failed: boolean
  onStart: (engine: AgentEngine) => void
  onAnswer: () => void
  onPreview: () => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [engine, setEngine] = useState<AgentEngine>('codex')
  const [showClarification, setShowClarification] = useState(false)
  const state = tddNodeState(requirement, session, building, generating, failed)
  const labels = documentLabels
  const baseMeta = TDD_NODE_META[state]
  const meta = {
    ...baseMeta,
    label: state === 'locked'
      ? `${labels.plan}尚不可用`
      : state === 'ready'
        ? `${labels.plan}待作业`
        : state === 'generating'
          ? `${labels.plan}生成中`
          : state === 'stale'
            ? `${labels.plan}需更新`
            : state === 'done'
              ? `${labels.plan}已输出`
              : state === 'error'
                ? `${labels.plan}执行失败`
                : baseMeta.label,
    hint: state === 'locked' ? `完成${labels.specification}后可开始技术作业` : baseMeta.hint,
  }

  const openNode = (event: React.MouseEvent) => {
    event.stopPropagation()
    setOpen(true)
  }

  const start = () => {
    setOpen(false)
    onStart(engine)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={openNode}
          className="group/tdd flex flex-col items-center gap-1 rounded-md outline-none"
          title={`${meta.label}：${meta.hint}`}
          aria-label={`${meta.label}：${meta.hint}`}
        >
          <TddStageDot state={state} />
          <span className={`text-[10px] font-medium transition-colors ${state === 'ready' || state === 'building' ? 'text-purple-600' : state === 'awaiting' || state === 'stale' ? 'text-amber-600' : state === 'generating' ? 'text-sky-600' : state === 'done' ? 'text-emerald-600' : state === 'error' ? 'text-rose-600' : 'text-[var(--color-muted-foreground)]'}`}>{compact ? '计划' : labels.plan}</span>
        </button>
      </PopoverAnchor>
      {open && (
        <PopoverContent
          className="w-72 p-0"
          side="bottom"
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
        >
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><TddStageDot state={state} />{meta.label}</div>
            <p className="mt-1.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">{requirement?.title || `当前需求尚未进入可执行的${labels.plan}阶段`}</p>
          </div>
          <DocumentLifecycleTimeline kind="TDD" session={session} />
          <div className="space-y-3 p-4">
            {state === 'locked' ? (
              <p className="rounded-lg bg-[var(--color-muted)] px-3 py-2.5 text-[11px] leading-5 text-[var(--color-muted-foreground)]">请先完成{labels.specificationClarify}并输出文档。{labels.specification}完成后，这里会自动变为紫色的“待作业”状态。</p>
            ) : state === 'building' ? (
              <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2.5 text-[11px] text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />AI 正在后台准备执行计划，完成后节点会变为绿色。</div>
            ) : state === 'generating' ? (
              <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-[11px] text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />{labels.plan}正在后台生成。完成后节点会自动变为绿色。</div>
            ) : state === 'awaiting' ? (
              <>
                <p className="text-[11px] leading-5 text-[var(--color-muted-foreground)]">这是旧流程留下的待回答状态。现在无需逐题回答，可直接重新生成{labels.plan}。</p>
                <button type="button" onClick={start} className="w-full rounded-lg bg-purple-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-purple-700">后台生成{labels.plan}</button>
              </>
            ) : state === 'done' ? (
              <button type="button" onClick={() => { setOpen(false); onPreview() }} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-emerald-700">预览{labels.planDocument}</button>
            ) : (
              <>
                <p className="text-[11px] leading-5 text-[var(--color-muted-foreground)]">
                  {state === 'stale'
                    ? `${labels.specification}或代码上下文已发生变化，建议重新生成${labels.plan}。`
                    : state === 'error'
                      ? `上次${labels.plan}作业未完成，可重新进入弹窗继续发起。`
                      : `AI 将结合${labels.specification}、代码与知识图谱直接生成文档，未决技术事项会写入${labels.plan}。`}
                </p>
                {state === 'stale' && (
                  <button type="button" onClick={() => { setOpen(false); onPreview() }} className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]">查看现有{labels.plan}</button>
                )}
                <div>
                  <div className="mb-1.5 text-[10px] font-medium text-[var(--color-muted-foreground)]">执行引擎</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['codex', 'claude'] as const).map(value => (
                      <button key={value} type="button" onClick={() => setEngine(value)} className={`rounded-lg border px-3 py-2 text-[11px] font-medium ${engine === value ? 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300' : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]'}`}>
                        {value === 'codex' ? 'Codex（默认）' : 'Claude'}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={start} className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-purple-700">
                  <Play className="h-3.5 w-3.5" />{state === 'ready' ? `后台生成${labels.plan}` : `重新生成${labels.plan}`}
                </button>
              </>
            )}
          </div>
          {!!session && (!!session.devDocQuestionsGeneratedAt || session.devDocQaDraft.length > 0 || session.devDocHistory.length > 0) && (
            <div className="border-t border-[var(--color-border)] p-3">
              <button type="button" onClick={() => { setOpen(false); setShowClarification(true) }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]">
                <ListTree className="h-3.5 w-3.5" />查看历史生成依据
              </button>
            </div>
          )}
        </PopoverContent>
      )}
      {showClarification && session && <ClarificationHistoryDialog kind="TDD" title={requirement?.title || labels.plan} session={session} onClose={() => setShowClarification(false)} />}
    </Popover>
  )
}
export function DeliveryTrack({
  item,
  requirement,
  prdSession,
  prdRunning = false,
  tddBuilding = false,
  tddGenerating = false,
  tddFailed = false,
  onStartPrd = async () => {},
  onAnswerPrd = () => {},
  onPreviewPrd = () => {},
  onStartTdd = () => {},
  onAnswerTdd = () => {},
  onPreviewTdd = () => {},
  compact = false,
}: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
  prdRunning?: boolean
  tddBuilding?: boolean
  tddGenerating?: boolean
  tddFailed?: boolean
  onStartPrd?: (engine: AgentEngine) => Promise<void>
  onAnswerPrd?: () => void
  onPreviewPrd?: () => void
  onStartTdd?: (engine: AgentEngine) => void
  onAnswerTdd?: () => void
  onPreviewTdd?: () => void
  compact?: boolean
}) {
  const progress = requirement ? requirementProgress(requirement) : null
  const stages = [
    { key: 'prd' as const, label: '核心规格' },
    { key: 'tdd' as const, label: 'TDD' },
    { key: 'code' as const, label: '代码' },
    { key: 'delivery' as const, label: '交付' },
  ]
  const deliveryState = requirement?.stages.runtime.status === 'COMPLETE'
    ? 'done'
    : requirement && [requirement.stages.test.status, requirement.stages.runtime.status].some(status => status === 'PARTIAL' || status === 'STALE')
      ? 'active'
      : 'empty'
  return (
    <div className="min-w-[218px]">
      <div className="flex items-center gap-1">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex items-center gap-1">
            {stage.key === 'prd' ? (
              <PrdStageNode compact={compact} item={item} requirement={requirement} prdSession={prdSession} running={prdRunning} onStart={onStartPrd} onAnswer={onAnswerPrd} onPreview={onPreviewPrd} />
            ) : stage.key === 'tdd' ? (
              <TddStageNode compact={compact} requirement={requirement} session={prdSession} building={tddBuilding} generating={tddGenerating} failed={tddFailed} onStart={onStartTdd} onAnswer={onAnswerTdd} onPreview={onPreviewTdd} />
            ) : stage.key === 'code' ? (
              <CodeStageNode compact={compact} item={item} requirement={requirement} prdSession={prdSession} />
            ) : (
              <div className="flex flex-col items-center gap-1" title={deliveryState === 'done' ? '已形成交付证据' : deliveryState === 'active' ? '正在进入交付验证' : '尚未进入交付验证'}>
                <StageDot state={deliveryState} />
                <span className={`text-[10px] font-medium ${deliveryState === 'done' ? 'text-emerald-600' : deliveryState === 'active' ? 'text-violet-600' : 'text-[var(--color-muted-foreground)]'}`}>交付</span>
              </div>
            )}
            {index < stages.length - 1 && <span className="mb-4 h-px w-4 bg-[var(--color-border)]" />}
          </div>
        ))}
        <span className="ml-2 mb-4 text-xs font-semibold tabular-nums text-[var(--color-foreground)]">{progress == null ? '—' : `${progress}%`}</span>
      </div>
      {!compact && <>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress ?? 0}%` }} />
        </div>
        <div className="mt-1 text-[8px] leading-3 text-[var(--color-muted-foreground)]">
          {requirement?.stages.code.updatedAt
            ? `代码分析 ${formatCompactTime(requirement.stages.code.updatedAt)}${requirement.stages.code.status === 'STALE' ? ' · 已过期' : ''}`
            : '点击“分析代码”检查本地实现 · 文档进度最高 20%'}
        </div>
      </>}
    </div>
  )
}

/** 兼容未返回显式标记的旧评估报告，并统一测试项识别口径。 */
import { CodeStageNode } from './ReqPoolCodeStage'

export { MarkdownDocumentModal, PrdQuestionsModal } from './ReqPoolDocumentDialogs'

