import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Database,
  FileText,
  Filter,
  Gauge,
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
import { getDeliveryOverview } from '@/features/delivery-center/api'
import { DeliveryStageDialog, GenerationSupplementDialog } from '@/features/delivery-center/components/DeliveryStageDialog'
import type { DeliveryOverview, DeliveryRequirement } from '@/features/delivery-center/types'
import { requirementProgress } from '@/features/delivery-center/viewModel'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { QuickRequirementDialog } from '../components/QuickRequirementDialog'
import { ReqpoolVibeDialog } from '../components/ReqpoolVibeDialog'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getSelfRepo } from '@/features/claude-chat/api'
import { useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import {
  getContent as getPrdContent,
  getDevDocContent,
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
} from '@/features/prd-clarify/api'
import type { QaPair } from '@/features/prd-clarify/api'
import type { AgentEngine, PrdSessionView } from '@/features/prd-clarify/types'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import { useAuth } from '@/lib/auth'
import { StartDevelopmentDialog } from '@/features/prd-clarify/components/StartDevelopmentDialog'

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
  { id: 'delivery', label: '交付证据', description: 'PRD、TDD、代码自动回填', enabled: true, ai: true },
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

function decisionOf(item: ReqItemView): Decision {
  if (item.status === 'CANCELLED') return 'PARK'
  if (item.status === 'DRAFT' || item.status === 'CLARIFYING') return 'CLARIFY'
  const insight = parseInsight(item.aiInsight)
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

function StageDot({ state }: { state: 'done' | 'active' | 'empty' }) {
  if (state === 'done') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>
  }
  if (state === 'active') {
    return <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-violet-500 bg-violet-50 dark:bg-violet-950"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /></span>
  }
  return <span className="h-5 w-5 rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-background)]" />
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
  draft: { label: 'PRD 草稿', hint: '点击开始异步澄清' },
  building: { label: '澄清问题构建中', hint: 'AI 正在生成问题' },
  awaiting: { label: '待回答澄清问题', hint: '点击填写问题卡片' },
  generating: { label: 'PRD 生成中', hint: '已提交回答，正在输出文档' },
  done: { label: 'PRD 已输出', hint: '点击预览 Markdown' },
  error: { label: 'PRD 执行失败', hint: '点击查看失败原因' },
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
    return <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-sky-500 bg-sky-50 dark:bg-sky-950"><span className="absolute inset-[-4px] animate-ping rounded-full border border-sky-400/45" /><span className="h-1.5 w-1.5 rounded-full bg-sky-500" /></span>
  }
  if (state === 'draft') {
    return <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-slate-400 bg-slate-50 dark:bg-slate-900"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /></span>
  }
  if (state === 'error') return <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">!</span>
  return <span className="h-5 w-5 rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-background)]" />
}

type TddNodeState = 'locked' | 'ready' | 'building' | 'awaiting' | 'generating' | 'stale' | 'done' | 'error'

function tddNodeState(requirement: DeliveryRequirement | undefined, session: PrdSessionView | undefined, building: boolean, generating: boolean, failed: boolean): TddNodeState {
  if (building || session?.devDocWorkStatus === 'BUILDING_QUESTIONS') return 'building'
  if (session?.devDocWorkStatus === 'AWAITING_ANSWERS') return 'awaiting'
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
  locked: { label: 'TDD 尚不可用', hint: '完成 PRD 后可开始技术作业' },
  ready: { label: 'TDD 待作业', hint: '点击开始技术澄清' },
  building: { label: '技术问题构建中', hint: 'AI 正在后台批量生成问题' },
  awaiting: { label: '待回答技术问题', hint: '点击填写批量问题卡片' },
  generating: { label: 'TDD 生成中', hint: '答案已提交，正在后台输出文档' },
  stale: { label: 'TDD 需更新', hint: '上游已变化，点击重新作业' },
  done: { label: 'TDD 已输出', hint: '点击预览 Markdown' },
  error: { label: 'TDD 执行失败', hint: '点击重新进入技术作业' },
}

function TddStageDot({ state }: { state: TddNodeState }) {
  if (state === 'done') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"><Check className="h-3 w-3" /></span>
  }
  if (state === 'ready') {
    return <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-purple-500 bg-purple-50 dark:bg-purple-950"><span className="h-1.5 w-1.5 rounded-full bg-purple-500" /></span>
  }
  if (state === 'building') {
    return <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-violet-500 bg-violet-50 dark:bg-violet-950"><span className="absolute inset-[-4px] animate-ping rounded-full border border-violet-400/50" /><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /></span>
  }
  if (state === 'awaiting') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm shadow-amber-500/30">!</span>
  }
  if (state === 'generating') {
    return <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-sky-500 bg-sky-50 dark:bg-sky-950"><span className="absolute inset-[-4px] animate-ping rounded-full border border-sky-400/45" /><span className="h-1.5 w-1.5 rounded-full bg-sky-500" /></span>
  }
  if (state === 'stale') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm shadow-amber-500/30">!</span>
  }
  if (state === 'error') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">!</span>
  }
  return <span className="h-5 w-5 rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-background)]" />
}

function DocumentStatusLegend() {
  const [open, setOpen] = useState(false)
  const states: Array<{ state: Exclude<PrdNodeState, 'empty'>; description: string }> = [
    { state: 'draft', description: '尚未启动 AI 澄清，可点击选择引擎并开始。' },
    { state: 'building', description: 'AI 正在后台构建澄清问题，暂时无需操作。' },
    { state: 'awaiting', description: '澄清问题已经返回，点击节点填写问题卡片。' },
    { state: 'generating', description: '回答已经提交，AI 正在生成 PRD Markdown。' },
    { state: 'done', description: 'PRD 已输出，点击节点直接预览文档。' },
    { state: 'error', description: '澄清或文档生成失败，点击节点查看原因。' },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button type="button" onClick={() => setOpen(value => !value)} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 text-[10px] font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]" aria-label="查看文档节点状态说明">
          <span className="flex items-center -space-x-0.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-slate-400 bg-slate-50" />
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          文档节点状态
        </button>
      </PopoverAnchor>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-xs font-semibold">PRD / TDD 节点颜色说明</div>
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">颜色表示当前需要等待、处理还是查看结果；节点均可直接点按。</p>
        </div>
        <div className="max-h-[65vh] space-y-0.5 overflow-y-auto p-2">
          <div className="px-2 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">PRD</div>
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
          <div className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">TDD</div>
          {(['locked', 'ready', 'building', 'awaiting', 'generating', 'stale', 'done', 'error'] as TddNodeState[]).map(state => (
            <div key={state} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-[var(--color-muted)]/60">
              <span className="mt-0.5 shrink-0"><TddStageDot state={state} /></span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold">{TDD_NODE_META[state].label}</div>
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
          label: '完成澄清并输出 PRD',
          time: session?.prdGeneratedAt ?? legacyPrdOutput,
          pending: session?.status === 'GENERATING' ? '生成中' : '尚未输出',
          inferred: !!legacyPrdOutput,
        },
      ]
    : [
        {
          label: '技术澄清问题生成完成',
          time: session?.devDocQuestionsGeneratedAt,
          pending: session?.devDocWorkStatus === 'BUILDING_QUESTIONS' ? '生成中' : '尚未生成',
        },
        {
          label: '完成澄清并输出 TDD',
          time: session?.devDocGeneratedAt,
          pending: session?.devDocWorkStatus === 'GENERATING' ? '生成中' : '尚未输出',
        },
      ]

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
        <Clock3 className="h-3 w-3" />{kind} 作业时间线
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

function formatLifecycleTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
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
}: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
  running: boolean
  onStart: (engine: AgentEngine) => Promise<void>
  onAnswer: () => void
  onPreview: () => void
}) {
  const [open, setOpen] = useState(false)
  const [engine, setEngine] = useState<AgentEngine>('codex')
  const [startError, setStartError] = useState('')
  const [showClarification, setShowClarification] = useState(false)
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
  const questionsReady = (session?.questions.length ?? 0) > 0

  if (state === 'empty') {
    return (
      <div className="flex flex-col items-center gap-1" title="尚未关联 PRD">
        <PrdStageDot state="empty" running={false} />
        <span className="text-[10px] text-[var(--color-muted-foreground)]">PRD</span>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setStartError('') }}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={openNode}
          className="group/prd flex flex-col items-center gap-1 rounded-md outline-none"
          title={`${PRD_NODE_META[state].label}：${PRD_NODE_META[state].hint}`}
          aria-label={`${PRD_NODE_META[state].label}，${PRD_NODE_META[state].hint}`}
        >
          <PrdStageDot state={state} running={running} />
          <span className={`text-[10px] font-medium transition-colors ${state === 'draft' ? 'text-slate-500' : state === 'building' ? 'text-violet-600' : state === 'awaiting' ? 'text-amber-600' : state === 'generating' ? 'text-sky-600' : state === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>PRD</span>
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
              {PRD_NODE_META[state].label}
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
            <div className="p-4"><div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-[11px] text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />回答已提交，正在生成 PRD Markdown…</div></div>
          ) : state === 'awaiting' ? (
            <div className="space-y-3 p-4">
              <p className="text-[11px] leading-5 text-[var(--color-muted-foreground)]">澄清问题已返回，完成回答后可补充额外信息并生成 PRD。</p>
              <button type="button" onClick={() => { setOpen(false); onAnswer() }} className="w-full rounded-lg bg-amber-500 px-3 py-2.5 text-xs font-medium text-white hover:bg-amber-600">填写澄清答案</button>
            </div>
          ) : state === 'done' ? (
            <div className="p-4">
              <button type="button" onClick={() => { setOpen(false); onPreview() }} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-emerald-700">预览 PRD 文档</button>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{session?.errorMsg || 'PRD 执行失败，请稍后重试。'}</p>
              {questionsReady && <button type="button" onClick={onAnswer} className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-xs font-medium text-amber-700 hover:bg-amber-50">返回问题卡片</button>}
            </div>
          )}
          {questionsReady && (
            <div className="border-t border-[var(--color-border)] p-3">
              <button type="button" onClick={() => { setOpen(false); setShowClarification(true) }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]">
                <ListTree className="h-3.5 w-3.5" />查看 PRD 澄清记录
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
  onAnswer,
  onPreview,
}: {
  requirement?: DeliveryRequirement
  session?: PrdSessionView
  building: boolean
  generating: boolean
  failed: boolean
  onStart: (engine: AgentEngine) => void
  onAnswer: () => void
  onPreview: () => void
}) {
  const [open, setOpen] = useState(false)
  const [engine, setEngine] = useState<AgentEngine>('codex')
  const [showClarification, setShowClarification] = useState(false)
  const state = tddNodeState(requirement, session, building, generating, failed)
  const meta = TDD_NODE_META[state]

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
          <span className={`text-[10px] font-medium transition-colors ${state === 'ready' || state === 'building' ? 'text-purple-600' : state === 'awaiting' || state === 'stale' ? 'text-amber-600' : state === 'generating' ? 'text-sky-600' : state === 'done' ? 'text-emerald-600' : state === 'error' ? 'text-rose-600' : 'text-[var(--color-muted-foreground)]'}`}>TDD</span>
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
            <p className="mt-1.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">{requirement?.title || '当前需求尚未进入可执行的 TDD 阶段'}</p>
          </div>
          <DocumentLifecycleTimeline kind="TDD" session={session} />
          <div className="space-y-3 p-4">
            {state === 'locked' ? (
              <p className="rounded-lg bg-[var(--color-muted)] px-3 py-2.5 text-[11px] leading-5 text-[var(--color-muted-foreground)]">请先完成 PRD 澄清并输出文档。PRD 完成后，这里会自动变为紫色的“待作业”状态。</p>
            ) : state === 'building' ? (
              <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2.5 text-[11px] text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />AI 正在后台批量构建技术问题，完成后节点会变为橙色。</div>
            ) : state === 'generating' ? (
              <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-[11px] text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />答案已提交，TDD 正在后台生成。完成后节点会自动变为绿色。</div>
            ) : state === 'awaiting' ? (
              <>
                <p className="text-[11px] leading-5 text-[var(--color-muted-foreground)]">技术澄清问题已返回，完成回答后可补充约束与附件并生成 TDD。</p>
                <button type="button" onClick={() => { setOpen(false); onAnswer() }} className="w-full rounded-lg bg-amber-500 px-3 py-2.5 text-xs font-medium text-white hover:bg-amber-600">填写技术澄清答案</button>
              </>
            ) : state === 'done' ? (
              <button type="button" onClick={() => { setOpen(false); onPreview() }} className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-emerald-700">预览 TDD 文档</button>
            ) : (
              <>
                <p className="text-[11px] leading-5 text-[var(--color-muted-foreground)]">
                  {state === 'stale'
                    ? 'PRD 或代码上下文已发生变化，建议重新进行技术澄清并更新 TDD。'
                    : state === 'error'
                      ? '上次 TDD 作业未完成，可重新进入弹窗继续发起。'
                      : 'AI 将结合 PRD、代码与知识图谱，只询问编码前必须确认的技术决策。'}
                </p>
                {state === 'stale' && (
                  <button type="button" onClick={() => { setOpen(false); onPreview() }} className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]">查看现有 TDD</button>
                )}
                {state === 'error' && (session?.devDocQaDraft.length ?? 0) > 0 && (
                  <button type="button" onClick={() => { setOpen(false); onAnswer() }} className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-xs font-medium text-amber-700 hover:bg-amber-50">恢复已保存的澄清答案</button>
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
                  <Play className="h-3.5 w-3.5" />{state === 'ready' ? '后台生成技术问题' : '重新生成技术问题'}
                </button>
              </>
            )}
          </div>
          {!!session && (!!session.devDocQuestionsGeneratedAt || session.devDocQaDraft.length > 0 || session.devDocHistory.length > 0) && (
            <div className="border-t border-[var(--color-border)] p-3">
              <button type="button" onClick={() => { setOpen(false); setShowClarification(true) }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]">
                <ListTree className="h-3.5 w-3.5" />查看 TDD 澄清记录
              </button>
            </div>
          )}
        </PopoverContent>
      )}
      {showClarification && session && <ClarificationHistoryDialog kind="TDD" title={requirement?.title || 'TDD'} session={session} onClose={() => setShowClarification(false)} />}
    </Popover>
  )
}

function DeliveryTrack({
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
}) {
  const progress = requirement ? requirementProgress(requirement) : null
  const stages = [
    { key: 'prd' as const, label: 'PRD' },
    { key: 'tdd' as const, label: 'TDD' },
    { key: 'code' as const, label: '代码' },
  ]
  return (
    <div className="min-w-[176px]">
      <div className="flex items-center gap-1">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex items-center gap-1">
            {stage.key === 'prd' ? (
              <PrdStageNode item={item} requirement={requirement} prdSession={prdSession} running={prdRunning} onStart={onStartPrd} onAnswer={onAnswerPrd} onPreview={onPreviewPrd} />
            ) : stage.key === 'tdd' ? (
              <TddStageNode requirement={requirement} session={prdSession} building={tddBuilding} generating={tddGenerating} failed={tddFailed} onStart={onStartTdd} onAnswer={onAnswerTdd} onPreview={onPreviewTdd} />
            ) : (
              <CodeStageNode item={item} requirement={requirement} prdSession={prdSession} />
            )}
            {index < stages.length - 1 && <span className="mb-4 h-px w-4 bg-[var(--color-border)]" />}
          </div>
        ))}
        <span className="ml-2 mb-4 text-xs font-semibold tabular-nums text-[var(--color-foreground)]">{progress == null ? '—' : `${progress}%`}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress ?? 0}%` }} />
      </div>
      <div className="mt-1 text-[8px] leading-3 text-[var(--color-muted-foreground)]">
        {requirement?.stages.code.updatedAt
          ? `代码分析 ${formatCompactTime(requirement.stages.code.updatedAt)}${requirement.stages.code.status === 'STALE' ? ' · 已过期' : ''}`
          : '点击“分析代码”检查本地实现 · 文档进度最高 20%'}
      </div>
    </div>
  )
}

function CodeStageNode({ item, requirement, prdSession }: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [loadingDevelopment, setLoadingDevelopment] = useState(false)
  const [developmentDocs, setDevelopmentDocs] = useState<{ prd: string; tdd?: string } | null>(null)
  const code = requirement?.stages.code
  const canAnalyze = !!requirement && requirement.stages.tdd.status !== 'MISSING'
  const isAdmin = !!user?.roles?.includes('ADMIN')
  const isAssignee = !!user && item.assigneeUserId === user.userId
  const canDevelop = !!prdSession && (isAdmin || isAssignee)

  const openDevelopment = async () => {
    if (!prdSession || !canDevelop || loadingDevelopment) return
    setLoadingDevelopment(true)
    setError('')
    try {
      const [prd, tdd] = await Promise.all([
        getPrdContent(prdSession.id),
        getDevDocContent(prdSession.id).catch(() => ''),
      ])
      setOpen(false)
      setDevelopmentDocs({ prd, tdd: tdd.trim() ? tdd : undefined })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取 PRD / TDD 失败')
    } finally {
      setLoadingDevelopment(false)
    }
  }

  const analyze = () => {
    if (!requirement || running || !canAnalyze) return
    setRunning(true)
    setError('')
    let finished = false
    const finish = (message?: string) => {
      if (finished) return
      finished = true
      setRunning(false)
      if (message) setError(message)
      void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['prd-sessions', 'reqpool'] })
    }
    runCodeProgressAnalysis(requirement.id, undefined, {
      onEvent(name, data) {
        if (name === 'done') finish()
        if (name === 'error') {
          const message = typeof data === 'object' && data && 'message' in data && typeof data.message === 'string'
            ? data.message
            : '本地代码进度分析失败'
          finish(message)
        }
      },
      onError(cause) { finish(cause instanceof Error ? cause.message : '本地代码分析连接失败') },
      onClose() { if (!finished) finish('分析连接已关闭，请稍后重试') },
    })
  }

  const state = stageState(requirement, 'code')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button type="button" onClick={event => { event.stopPropagation(); setOpen(true) }} className={`flex flex-col items-center gap-1 rounded-md outline-none ${code?.score == null ? 'text-violet-600' : ''}`} title="查看或重新分析本地代码进度">
          {code?.score == null ? (
            <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-violet-500 bg-violet-50 dark:bg-violet-950/30"><Search className="h-2.5 w-2.5" /></span>
          ) : <StageDot state={state} />}
          <span className={`whitespace-nowrap text-[10px] font-medium ${code?.status === 'STALE' ? 'text-amber-600' : code?.score != null ? 'text-emerald-600' : 'text-violet-600'}`}>{code?.score == null ? '分析代码' : '代码'}</span>
        </button>
      </PopoverAnchor>
      {open && (
        <PopoverContent className="w-72 p-0" side="bottom" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">本地代码实现分析</div>
              <span className="text-sm font-semibold tabular-nums">{code?.score == null ? '未分析' : `${code.score}%`}</span>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">按 TDD 功能点检查本地代码知识图谱中的类、方法、接口、数据表与测试证据。</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-lg bg-[var(--color-muted)]/55 px-3 py-2.5">
              <div className="text-[9px] text-[var(--color-muted-foreground)]">最近分析时间</div>
              <div className="mt-1 text-[11px] font-medium tabular-nums">{code?.updatedAt ? formatLifecycleTime(code.updatedAt) : '尚未分析'}</div>
              {code?.status === 'STALE' && <div className="mt-1 text-[10px] text-amber-600">PRD/TDD 已更新，本次结果已过期</div>}
            </div>
            <p className="text-[10px] leading-4 text-[var(--color-muted-foreground)]">{code?.note || '完成 PRD 与 TDD 后即可核查本地实现。没有真实代码证据的功能不会计为完成。'}</p>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
            <button type="button" disabled={!canAnalyze || running} onClick={analyze} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {running ? '正在检查本地代码…' : code?.updatedAt ? '重新分析本地代码' : '开始分析本地代码'}
            </button>
            {!canAnalyze && <p className="text-center text-[9px] text-[var(--color-muted-foreground)]">请先完成 TDD 文档</p>}
            <div className="border-t border-[var(--color-border)] pt-3">
              <button type="button" disabled={!canDevelop || loadingDevelopment} onClick={() => void openDevelopment()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
                {loadingDevelopment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                {prdSession?.devSessionId ? '继续 Vibe Coding 开发' : '发起 Vibe Coding 开发'}
              </button>
              {!user && <p className="mt-2 text-center text-[9px] text-amber-600">登录后可校验开发权限</p>}
              {user && !canDevelop && <p className="mt-2 text-center text-[9px] text-[var(--color-muted-foreground)]">仅管理员或当前需求负责人可操作</p>}
            </div>
          </div>
        </PopoverContent>
      )}
      {developmentDocs && prdSession && (
        <StartDevelopmentDialog
          title={item.title}
          sessionId={prdSession.id}
          projectName={item.project}
          content={developmentDocs.prd}
          devDocContent={developmentDocs.tdd}
          existingDevSessionId={prdSession.devSessionId}
          initialEngine="codex"
          onClose={() => setDevelopmentDocs(null)}
        />
      )}
    </Popover>
  )
}

function formatCompactTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(timestamp))
}

function PrdQuestionsModal({ item, session, onClose, onSubmit }: {
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

function MarkdownDocumentModal({ item, kind, onClose, onOpenFull }: {
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

function DecisionBadge({ decision }: { decision: Decision }) {
  const meta = DECISION_META[decision]
  return (
    <div className={`inline-flex min-w-[98px] flex-col rounded-lg border px-2.5 py-2 ${meta.cls}`}>
      <span className="flex items-center gap-1.5 text-xs font-semibold"><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
      <span className="mt-0.5 text-[10px] opacity-75">{meta.hint}</span>
    </div>
  )
}

const FACT_QUALITY_TONE: Record<FactQualityResult['level'], { badge: string; bar: string }> = {
  READY: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300', bar: 'bg-emerald-500' },
  REVIEW: { badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300', bar: 'bg-sky-500' },
  CLARIFY: { badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300', bar: 'bg-amber-500' },
  BLOCKED: { badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300', bar: 'bg-rose-500' },
}

function FactQualityDetails({ quality }: { quality: FactQualityResult }) {
  const tone = FACT_QUALITY_TONE[quality.level]
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div><div className="text-[10px] text-[var(--color-muted-foreground)]">需求事实质量</div><div className="mt-0.5 flex items-baseline gap-1"><span className="text-2xl font-semibold tabular-nums">{quality.score}</span><span className="text-[10px] text-[var(--color-muted-foreground)]">/ 100 · {quality.grade}级</span></div></div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone.badge}`}>{quality.levelLabel}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${quality.score}%` }} /></div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px]"><span className="rounded bg-[var(--color-muted)] px-2 py-1">{quality.reqTypeLabel}{quality.inferredType ? ' · 系统推断' : ''}</span><span className="max-w-full truncate rounded bg-[var(--color-muted)] px-2 py-1" title={quality.locationLabel}>{quality.locationLabel}</span></div>
      <div className="mt-4 space-y-2">
        {quality.criteria.map(item => {
          const deducted = item.weight - item.earned
          return <div key={item.key} className="rounded-lg border border-[var(--color-border)] px-3 py-2.5"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold">{item.label}</span><span className={`text-[10px] font-semibold tabular-nums ${deducted > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{item.earned}/{item.weight}{deducted > 0 ? ` · 扣${deducted}` : ''}</span></div><p className="mt-1 text-[9px] leading-4 text-[var(--color-muted-foreground)]">{item.reason}</p></div>
        })}
      </div>
      <p className="mt-3 text-[9px] leading-4 text-[var(--color-muted-foreground)]">统一口径：定位 25 · 问题与目标 25 · 场景影响 15 · 验收 15 · 边界 10 · 证据 10。分数仅评价事实是否足以交给开发，不评价业务价值。</p>
    </div>
  )
}

function FactQualityBadge({ item, session }: { item: ReqItemView; session?: PrdSessionView }) {
  const quality = evaluateRequirementFacts(item, session)
  const tone = FACT_QUALITY_TONE[quality.level]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" onClick={event => event.stopPropagation()} className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${tone.badge}`} title="查看需求事实质量评分与扣分原因"><Gauge className="h-2.5 w-2.5" />事实 {quality.score}</button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[min(92vw,380px)] p-4" onClick={event => event.stopPropagation()}>
        <FactQualityDetails quality={quality} />
      </PopoverContent>
    </Popover>
  )
}

function ScoreRing({ value }: { value: number }) {
  const degrees = Math.round(value * 3.6)
  return (
    <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-primary) ${degrees}deg, var(--color-muted) 0deg)` }}>
      <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-card)] text-[10px] font-bold tabular-nums">{value}</div>
    </div>
  )
}

function LeaderBrief({ items, overview }: { items: ReqItemView[]; overview?: DeliveryOverview }) {
  const [copied, setCopied] = useState(false)
  const active = items.filter(item => decisionOf(item) === 'NOW')
  const clarify = items.filter(item => decisionOf(item) === 'CLARIFY')
  const riskCount = overview?.summary.highRiskCount ?? clarify.length
  const progress = overview?.summary.overallProgress ?? 0
  const top = [...active, ...items].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index).slice(0, 3)

  const copyBrief = async () => {
    const lines = [
      `【需求组合周报】总体健康度：${riskCount > 2 ? '需关注' : '健康'}`,
      `一、建议集中资源推进 ${active.length} 项；等待决策 ${clarify.length} 项；整体交付进度 ${progress}%。`,
      `二、管理关注：当前 ${riskCount} 项高风险，优先补齐业务收益、验收口径与唯一责任人。`,
      ...top.map((item, index) => `${index + 1}. ${item.title}（${DECISION_META[decisionOf(item)].label}）`),
      '以上结论由 AI 根据需求、PRD、TDD 与代码证据自动生成。',
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="space-y-5 px-5 pb-10 pt-4 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-[linear-gradient(120deg,rgba(124,58,237,0.10),rgba(59,130,246,0.04)_48%,transparent)] dark:border-violet-900">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300"><Sparkles className="h-4 w-4" /> AI 已根据最新 PRD / TDD / 代码证据生成</div>
            <h2 className="text-2xl font-semibold tracking-tight">本周需求组合总体可控，建议集中资源推进 {active.length} 项</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">
              当前共 {items.length} 项需求，{riskCount} 项需要管理关注。主要矛盾不是开发速度，而是需求价值与验收口径尚未闭环；建议先完成高价值项的决策和责任确认，再承诺排期。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 rounded-xl border border-white/60 bg-white/65 px-5 py-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/15">
            <ScoreRing value={overview?.summary.healthScore ?? Math.max(0, 88 - riskCount * 6)} />
            <div><div className="text-xs text-[var(--color-muted-foreground)]">组合健康度</div><div className="mt-0.5 text-lg font-semibold">{riskCount > 2 ? '需关注' : '健康'}</div></div>
          </div>
        </div>
        <div className="grid border-t border-violet-200/70 bg-white/35 md:grid-cols-4 dark:border-violet-900 dark:bg-black/10">
          {[
            ['建议投入', `${active.length} 项`, 'text-emerald-600'],
            ['等待决策', `${clarify.length} 项`, 'text-amber-600'],
            ['整体进度', `${progress}%`, 'text-violet-600'],
            ['证据可信度', `${overview?.summary.confidence ?? 0}%`, 'text-sky-600'],
          ].map(([label, value, cls]) => (
            <div key={label} className="border-b border-violet-100 px-6 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 dark:border-violet-900/60">
              <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div><div className={`mt-1 text-xl font-semibold ${cls}`}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div><h3 className="text-sm font-semibold">本周优先事项</h3><p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">只展示需要资源或决策的事项</p></div>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">AI 推荐</span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {top.length === 0 ? <div className="p-10 text-center text-sm text-[var(--color-muted-foreground)]">登记需求后，AI 将自动生成优先事项</div> : top.map((item, index) => {
              const insight = parseInsight(item.aiInsight)
              return (
                <div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[32px_minmax(0,1fr)_150px] md:items-center">
                  <div className="text-xl font-semibold text-[var(--color-muted-foreground)]/45">{String(index + 1).padStart(2, '0')}</div>
                  <div><div className="font-medium">{item.title}</div><div className="mt-1 line-clamp-1 text-xs text-[var(--color-muted-foreground)]">{insight?.recommendation || excerpt(item.description)}</div></div>
                  <DecisionBadge decision={decisionOf(item)} />
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-500" /><h3 className="text-sm font-semibold">需要领导决策</h3></div>
          <div className="mt-4 space-y-3">
            {clarify.slice(0, 3).map(item => (
              <div key={item.id} className="rounded-xl bg-[var(--color-muted)]/65 p-3.5">
                <div className="text-xs font-medium">{item.title}</div>
                <div className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-[var(--color-muted-foreground)]"><ArrowRight className="mt-1 h-3 w-3 shrink-0 text-amber-500" />请确认业务收益、验收口径与唯一责任人</div>
              </div>
            ))}
            {clarify.length === 0 && <div className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted-foreground)]">当前没有待决策事项</div>}
          </div>
          <button onClick={copyBrief} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] py-2 text-xs font-medium hover:bg-[var(--color-muted)]">{copied ? <CircleCheck className="h-3.5 w-3.5 text-emerald-500" /> : <FileText className="h-3.5 w-3.5" />}{copied ? '已复制到剪贴板' : '复制领导汇报稿'}</button>
        </section>
      </div>
    </div>
  )
}

function AiStudio({ fields, density, onFieldsChange, onDensityChange, onClose }: {
  fields: DisplayField[]
  density: Density
  onFieldsChange: (fields: DisplayField[]) => void
  onDensityChange: (density: Density) => void
  onClose: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [message, setMessage] = useState('')

  const runPrompt = () => {
    const text = prompt.trim()
    if (!text) return
    if (text.includes('精简') || text.includes('紧凑')) onDensityChange('compact')
    if (text.includes('展开') || text.includes('舒适')) onDensityChange('comfortable')
    if (text.includes('隐藏业务') || text.includes('去掉业务')) onFieldsChange(fields.map(field => field.id === 'value' ? { ...field, enabled: false } : field))
    if (text.includes('风险')) onFieldsChange(fields.map(field => field.id === 'risk' ? { ...field, enabled: true } : field))
    setMessage('已生成当前视图配置，原始数据未改变')
    setPrompt('')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-[420px] flex-col border-l border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--color-border)] p-5">
          <div><div className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-600 text-white"><Wand2 className="h-4 w-4" /></span>AI 视图工作室</div><p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">用自然语言改字段、布局和汇报方式，不改变底层标准数据。</p></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div>
            <label className="text-xs font-semibold">告诉 AI 你想怎么看</label>
            <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3 focus-within:border-violet-400 dark:border-violet-900 dark:bg-violet-950/20">
              <textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); runPrompt() } }} rows={3} placeholder="例如：精简表格，突出风险和负责人" className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]" />
              <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-[var(--color-muted-foreground)]">Enter 生成视图</span><button onClick={runPrompt} className="grid h-7 w-7 place-items-center rounded-lg bg-violet-600 text-white"><ArrowUpRight className="h-3.5 w-3.5" /></button></div>
            </div>
            {message && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600"><CircleCheck className="h-3.5 w-3.5" />{message}</div>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['只看本周风险', '生成领导周报', '精简为 5 列'].map(text => <button key={text} onClick={() => setPrompt(text)} className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:border-violet-300 hover:text-violet-600">{text}</button>)}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between"><label className="text-xs font-semibold">标准字段</label><span className="text-[10px] text-[var(--color-muted-foreground)]">点击显隐</span></div>
            <div className="mt-2 overflow-hidden rounded-xl border border-[var(--color-border)]">
              {fields.map(field => (
                <div key={field.id} className="flex items-center gap-3 border-b border-[var(--color-border)] p-3 last:border-b-0">
                  <GripVertical className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]/50" />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-xs font-medium">{field.label}{field.ai && <Sparkles className="h-3 w-3 text-violet-500" />}</div><div className="mt-0.5 truncate text-[10px] text-[var(--color-muted-foreground)]">{field.description}</div></div>
                  <button onClick={() => onFieldsChange(fields.map(item => item.id === field.id ? { ...item, enabled: !item.enabled } : item))} className={`relative h-5 w-9 rounded-full transition-colors ${field.enabled ? 'bg-violet-600' : 'bg-[var(--color-muted)]'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${field.enabled ? 'left-[18px]' : 'left-0.5'}`} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold">展示密度</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([['comfortable', '舒适', '适合评审'], ['compact', '紧凑', '适合日常']] as const).map(([value, label, hint]) => <button key={value} onClick={() => onDensityChange(value)} className={`rounded-xl border p-3 text-left ${density === value ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30' : 'border-[var(--color-border)]'}`}><div className="flex items-center justify-between text-xs font-medium">{label}{density === value && <Check className="h-3.5 w-3.5 text-violet-600" />}</div><div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{hint}</div></button>)}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300"><Database className="h-3.5 w-3.5" />治理原则</div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--color-muted-foreground)]">所有团队共用同一套事实与判定字段；个性差异通过视图解决。这样既能自由表达，又不会产生新的数据孤岛。</p>
          </div>
        </div>
      </aside>
    </div>
  )
}

function RequirementDrawer({ item, requirement, prdSession, analyzing, prdRunning, tddBuilding, tddGenerating, tddFailed, onClose, onAnalyze, onClarify, onStartPrd, onAnswerPrd, onPreviewPrd, onStartTdd, onAnswerTdd, onPreviewTdd, onViewPrd, onDelete }: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
  analyzing: boolean
  prdRunning: boolean
  tddBuilding: boolean
  tddGenerating: boolean
  tddFailed: boolean
  onClose: () => void
  onAnalyze: () => void
  onClarify: () => void
  onStartPrd: (engine: AgentEngine) => Promise<void>
  onAnswerPrd: () => void
  onPreviewPrd: () => void
  onStartTdd: (engine: AgentEngine) => void
  onAnswerTdd: () => void
  onPreviewTdd: () => void
  onViewPrd: () => void
  onDelete: () => void
}) {
  const insight = parseInsight(item.aiInsight)
  const decision = decisionOf(item)
  const factQuality = evaluateRequirementFacts(item, prdSession)
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="h-full w-full max-w-[520px] overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)]/95 px-5 py-4 backdrop-blur"><span className="text-xs font-medium text-[var(--color-muted-foreground)]">需求详情 · {item.id.slice(0, 8).toUpperCase()}</span><button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]"><X className="h-4 w-4" /></button></div>
        <div className="space-y-6 p-6">
          <div><div className="flex items-center gap-2"><DecisionBadge decision={decision} /><span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span></div><h2 className="mt-4 text-xl font-semibold leading-8">{item.title}</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--color-muted-foreground)]">{item.description || '尚未补充需求描述。'}</p></div>
          <div className="grid grid-cols-2 gap-3">
            {[[Building2, '系统 / 模块', `${item.project || '待归属'} / ${item.module || '待归类'}`], [UserRound, '唯一负责人', item.assignee || '待指派'], [CalendarDays, '承诺时间', dateLabel(item.deadline)], [Radio, '数据来源', item.prdSessionId ? 'PRD 自动同步' : '统一登记']].map(([Icon, label, value]) => { const CellIcon = Icon as typeof Building2; return <div key={String(label)} className="rounded-xl bg-[var(--color-muted)]/60 p-3"><CellIcon className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" /><div className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">{String(label)}</div><div className="mt-0.5 text-xs font-medium">{String(value)}</div></div> })}
          </div>
          <div className="rounded-xl border border-[var(--color-border)] p-4"><FactQualityDetails quality={factQuality} /></div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300"><Sparkles className="h-4 w-4" />AI 判定依据</div><button onClick={onAnalyze} disabled={analyzing} className="text-[10px] text-violet-600 disabled:opacity-50">{analyzing ? '分析中…' : '重新分析'}</button></div><p className="mt-3 text-sm leading-6">{insight?.reason || '尚未生成跨需求价值分析。AI 将统一考虑战略匹配、用户影响、收益、成本与风险。'}</p>{insight?.impacts && <div className="mt-3 flex flex-wrap gap-1.5">{insight.impacts.map(value => <span key={value} className="rounded-full bg-white px-2 py-1 text-[10px] text-violet-700 shadow-sm dark:bg-black/20 dark:text-violet-300">{value}</span>)}</div>}</div>
          <div><div className="mb-3 flex items-center justify-between text-xs font-semibold"><span>交付证据链</span><span className="text-[10px] font-normal text-[var(--color-muted-foreground)]">点击节点直接操作</span></div><div className="rounded-xl border border-[var(--color-border)] p-4"><DeliveryTrack item={item} requirement={requirement} prdSession={prdSession} prdRunning={prdRunning} tddBuilding={tddBuilding} tddGenerating={tddGenerating} tddFailed={tddFailed} onStartPrd={onStartPrd} onAnswerPrd={onAnswerPrd} onPreviewPrd={onPreviewPrd} onStartTdd={onStartTdd} onAnswerTdd={onAnswerTdd} onPreviewTdd={onPreviewTdd} /></div></div>
          <div className="flex flex-wrap gap-2">
            {!item.prdSessionId && item.status === 'DRAFT' && <button onClick={onClarify} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-medium text-white"><Sparkles className="h-3.5 w-3.5" />进入 AI 澄清</button>}
            {item.prdSessionId && prdSession?.status === 'CLARIFYING' && prdSession.questions.length > 0 && <button onClick={onAnswerPrd} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-medium text-white"><Sparkles className="h-3.5 w-3.5" />回答澄清问题</button>}
            {item.prdSessionId && prdSession?.status === 'DONE' && <button onClick={onViewPrd} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]"><FileText className="h-3.5 w-3.5" />查看 PRD</button>}
            <button onClick={onDelete} className="ml-auto flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-3.5 w-3.5" />删除</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function MobileRequirementCard({
  item,
  requirement,
  prdSession,
  selected,
  prdRunning,
  tddBuilding,
  tddGenerating,
  tddFailed,
  onToggle,
  onOpen,
  onDelete,
  onStartPrd,
  onAnswerPrd,
  onPreviewPrd,
  onStartTdd,
  onAnswerTdd,
  onPreviewTdd,
}: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
  selected: boolean
  prdRunning: boolean
  tddBuilding: boolean
  tddGenerating: boolean
  tddFailed: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
  onStartPrd: (engine: AgentEngine) => Promise<void>
  onAnswerPrd: () => void
  onPreviewPrd: () => void
  onStartTdd: (engine: AgentEngine) => void
  onAnswerTdd: () => void
  onPreviewTdd: () => void
}) {
  const insight = parseInsight(item.aiInsight)
  const factQuality = evaluateRequirementFacts(item, prdSession)
  return (
    <article className={`p-4 transition-colors ${selected ? 'bg-violet-50/65 dark:bg-violet-950/20' : ''}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--color-border)] accent-violet-600" aria-label={`选择需求：${item.title}`} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2"><DecisionBadge decision={decisionOf(item)} /><span className={`rounded-full px-2 py-1 text-[9px] font-medium ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span><span className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${FACT_QUALITY_TONE[factQuality.level].badge}`}><Gauge className="h-2.5 w-2.5" />事实 {factQuality.score}</span></div>
          <h3 className="mt-3 text-sm font-semibold leading-6">{item.title}</h3>
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{item.project || '待归属'} · {item.module || '待归类'}</p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-foreground)]/80">{insight?.reason || excerpt(item.description)}</p>
        </button>
        <button type="button" onClick={onDelete} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-rose-50 hover:text-rose-500" aria-label={`删除需求：${item.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-muted)]/45 px-3 py-3">
        <div className="min-w-0 text-[10px] text-[var(--color-muted-foreground)]">
          <div className="truncate"><UserRound className="mr-1 inline h-3 w-3" />{item.assignee || '待指派负责人'}</div>
          <div className="mt-1"><CalendarDays className="mr-1 inline h-3 w-3" />{dateLabel(item.deadline)}</div>
        </div>
        <DeliveryTrack item={item} requirement={requirement} prdSession={prdSession} prdRunning={prdRunning} tddBuilding={tddBuilding} tddGenerating={tddGenerating} tddFailed={tddFailed} onStartPrd={onStartPrd} onAnswerPrd={onAnswerPrd} onPreviewPrd={onPreviewPrd} onStartTdd={onStartTdd} onAnswerTdd={onAnswerTdd} onPreviewTdd={onPreviewTdd} />
      </div>
    </article>
  )
}

function AssigneeCell({
  item,
  users,
  loading,
  unavailable,
  saving,
  onAssign,
}: {
  item: ReqItemView
  users: AssignableUser[]
  loading: boolean
  unavailable: boolean
  saving: boolean
  onAssign: (userId: number | null) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('@')
  const [assignError, setAssignError] = useState('')
  const boundUser = users.find(user => user.userId === item.assigneeUserId)
  const displayName = boundUser?.realName || boundUser?.username || item.assignee
  const keyword = query.replace(/^@/, '').trim().toLowerCase()
  const filtered = users.filter(user => !keyword
    || user.username.toLowerCase().includes(keyword)
    || user.realName?.toLowerCase().includes(keyword))

  const choose = async (userId: number | null) => {
    setAssignError('')
    try {
      await onAssign(userId)
      setOpen(false)
      setQuery('@')
    } catch (cause) {
      setAssignError(cause instanceof Error ? cause.message : '指派失败')
    }
  }

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) { setQuery('@'); setAssignError('') } }}>
      <PopoverAnchor asChild>
        <div
          className="group/assignee min-w-[120px] rounded-lg p-1 -m-1 outline-none hover:bg-[var(--color-muted)]/70"
          title="双击 @ 选择指派人"
          onClick={event => event.stopPropagation()}
          onDoubleClick={event => {
            event.stopPropagation()
            setOpen(true)
          }}
        >
          <div className={`flex items-center gap-2 text-xs ${displayName ? '' : 'text-amber-600'}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-semibold ${displayName ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : 'bg-amber-50 dark:bg-amber-950/40'}`}>
              {displayName?.slice(0, 1).toUpperCase() || '?'}
            </span>
            <span className="min-w-0 flex-1 truncate">{displayName || '双击 @ 指派'}</span>
            <AtSign className="h-3 w-3 shrink-0 text-violet-500 opacity-0 transition-opacity group-hover/assignee:opacity-100" />
          </div>
          {boundUser && <div className="ml-8 mt-0.5 truncate text-[9px] text-[var(--color-muted-foreground)]">@{boundUser.username}</div>}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6} className="w-72 p-0" onOpenAutoFocus={event => event.preventDefault()}>
        <div className="border-b border-[var(--color-border)] p-2.5">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--color-muted)] px-2.5 py-2">
            <AtSign className="h-3.5 w-3.5 text-violet-500" />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value.startsWith('@') ? event.target.value : `@${event.target.value}`)}
              onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
              placeholder="@姓名或账号"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
          </div>
          <div className="mt-1.5 text-[9px] text-[var(--color-muted-foreground)]">从平台账号中选择，指派后绑定账号 ID</div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5">
          {loading ? <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-[var(--color-muted-foreground)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />正在查询账号…</div>
            : unavailable ? <div className="px-3 py-6 text-center text-xs text-rose-500">账号接口暂不可用</div>
              : filtered.length === 0 ? <div className="px-3 py-6 text-center text-xs text-[var(--color-muted-foreground)]">没有匹配的启用账号</div>
                : filtered.map(user => {
                  const selected = user.userId === item.assigneeUserId
                  const name = user.realName || user.username
                  return <button key={user.userId} type="button" disabled={saving} onClick={() => void choose(user.userId)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-violet-50 disabled:opacity-50 dark:hover:bg-violet-950/30 ${selected ? 'bg-violet-50 dark:bg-violet-950/30' : ''}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{name}</span><span className="block truncate text-[9px] text-[var(--color-muted-foreground)]">@{user.username}</span></span>{selected && <Check className="h-3.5 w-3.5 text-violet-600" />}</button>
                })}
        </div>
        {assignError && <div className="border-t border-[var(--color-border)] px-3 py-2 text-[10px] text-rose-500">{assignError}</div>}
        {item.assigneeUserId != null && <div className="border-t border-[var(--color-border)] p-1.5"><button type="button" disabled={saving} onClick={() => void choose(null)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-rose-500 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/30"><UserX className="h-3.5 w-3.5" />解除当前指派</button></div>}
      </PopoverContent>
    </Popover>
  )
}

function DeadlineEditor({
  item,
  saving,
  onSave,
}: {
  item: ReqItemView
  saving: boolean
  onSave: (deadline: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(item.deadline ?? '')
  const [error, setError] = useState('')

  useEffect(() => setDraft(item.deadline ?? ''), [item.deadline])

  const save = async (value = draft) => {
    setError('')
    try {
      await onSave(value)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '承诺时间保存失败')
    }
  }

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); setDraft(item.deadline ?? ''); setError('') }}>
      <PopoverTrigger asChild>
        <button type="button" onClick={event => event.stopPropagation()} className={`group/deadline mt-2 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] hover:bg-[var(--color-muted)] ${item.deadline ? 'text-[var(--color-muted-foreground)]' : 'text-amber-600'}`} title="点击填写承诺时间">
          <CalendarDays className="h-3 w-3" />
          <span>{dateLabel(item.deadline)}</span>
          <span className="ml-auto text-[9px] text-violet-500 opacity-0 transition-opacity group-hover/deadline:opacity-100">编辑</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={5} className="w-64 p-3" onClick={event => event.stopPropagation()}>
        <div className="text-xs font-semibold">承诺完成时间</div>
        <p className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">用于风险识别、排期承诺和超期提醒。</p>
        <input type="date" autoFocus value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && draft) void save(); if (event.key === 'Escape') setOpen(false) }} className="mt-3 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs outline-none focus:border-violet-400" />
        {error && <div className="mt-2 text-[10px] text-rose-500">{error}</div>}
        <div className="mt-3 flex items-center justify-between">
          <button type="button" disabled={saving || !item.deadline} onClick={() => void save('')} className="text-[10px] text-rose-500 disabled:opacity-30">清除时间</button>
          <button type="button" disabled={saving || !draft} onClick={() => void save()} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-medium text-white disabled:opacity-40">{saving && <Loader2 className="h-3 w-3 animate-spin" />}保存</button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ReqPoolPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { chat, activate, setFloating, setMinimized } = useChatRuntime()
  const [view, setView] = useState<ViewMode>('table')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ReqStatus | ''>('')
  const [decisionFilter, setDecisionFilter] = useState<Decision | ''>('')
  const [selected, setSelected] = useState<ReqItemView | null>(null)
  const [studioOpen, setStudioOpen] = useState(false)
  const [entryMenuOpen, setEntryMenuOpen] = useState(false)
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const [entryNotice, setEntryNotice] = useState('')
  const [viewPreference] = useState(loadViewPreference)
  const [fields, setFields] = useState(viewPreference.fields)
  const [density, setDensity] = useState<Density>(viewPreference.density)
  const [vibeOpen, setVibeOpen] = useState(false)
  const [vibeInitialPrompt, setVibeInitialPrompt] = useState('')
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [deadlineSavingId, setDeadlineSavingId] = useState<string | null>(null)
  const [clarifyingPrdIds, setClarifyingPrdIds] = useState<Set<string>>(() => new Set())
  const [generatingPrdIds, setGeneratingPrdIds] = useState<Set<string>>(() => new Set())
  const [buildingTddQuestionIds, setBuildingTddQuestionIds] = useState<Set<string>>(() => new Set())
  const [generatingTddIds, setGeneratingTddIds] = useState<Set<string>>(() => new Set())
  const [failedTddIds, setFailedTddIds] = useState<Set<string>>(() => new Set())
  const [questionPrd, setQuestionPrd] = useState<{ item: ReqItemView; session: PrdSessionView } | null>(null)
  const [previewPrd, setPreviewPrd] = useState<ReqItemView | null>(null)
  const [tddWork, setTddWork] = useState<DeliveryRequirement | null>(null)
  const [previewTdd, setPreviewTdd] = useState<ReqItemView | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkDeleteError, setBulkDeleteError] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const pendingVibeRef = useRef<{ cwd: string; seed: string; displayText: string; engine: ReqpoolVibeEngine } | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const itemsQuery = useQuery({ queryKey: ['reqpool'], queryFn: () => listItems() })
  const overviewQuery = useQuery({ queryKey: ['delivery-overview', 'reqpool'], queryFn: () => getDeliveryOverview(), retry: false })
  const prdSessionsQuery = useQuery({ queryKey: ['prd-sessions', 'reqpool'], queryFn: listPrdSessions, retry: false, refetchInterval: 3_000 })
  const usersQuery = useQuery({ queryKey: ['auth', 'assignable-users'], queryFn: listAssignableUsers, retry: false })
  const selfRepoQuery = useQuery({ queryKey: ['claude-chat-self-repo'], queryFn: getSelfRepo, staleTime: 60_000, retry: false })

  const syncMutation = useMutation({
    mutationFn: syncFromPrd,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reqpool'] }),
  })
  const portfolioMutation = useMutation({
    mutationFn: portfolioAnalyze,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reqpool'] }),
  })
  const seedMutation = useMutation({
    mutationFn: seedDemo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reqpool'] }),
  })

  useEffect(() => { syncMutation.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, JSON.stringify({ fields, density }))
  }, [density, fields])

  const items = itemsQuery.data ?? []
  const overview = overviewQuery.data
  const prdSessionById = useMemo(() => new Map((prdSessionsQuery.data ?? []).map(session => [session.id, session])), [prdSessionsQuery.data])
  const filteredItems = useMemo(() => items
    .filter(item => !status || item.status === status)
    .filter(item => !decisionFilter || decisionOf(item) === decisionFilter)
    .filter(item => {
      const keyword = query.trim().toLowerCase()
      if (!keyword) return true
      return [item.title, item.description, item.project, item.module, item.assignee, item.tags].some(value => value?.toLowerCase().includes(keyword))
    })
    .sort((a, b) => {
      const rankA = parseInsight(a.aiInsight)?.rank ?? 999
      const rankB = parseInsight(b.aiInsight)?.rank ?? 999
      return rankA - rankB || b.updatedAt - a.updatedAt
    }), [decisionFilter, items, query, status])

  const counts = useMemo(() => ({
    now: items.filter(item => decisionOf(item) === 'NOW').length,
    clarify: items.filter(item => decisionOf(item) === 'CLARIFY').length,
    delivery: items.filter(item => item.status === 'IN_DEV' || item.status === 'PRD_READY').length,
    risk: overview?.summary.highRiskCount ?? items.filter(item => !item.assignee || !item.deadline).length,
  }), [items, overview])

  const enabled = (id: string) => fields.find(field => field.id === id)?.enabled ?? false
  const columns = fields.filter(field => field.enabled).length
  const visibleIds = useMemo(() => filteredItems.map(item => item.id), [filteredItems])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected

  useEffect(() => {
    setSelectedIds(current => {
      const existingIds = new Set((itemsQuery.data ?? []).map(item => item.id))
      const next = new Set([...current].filter(id => existingIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [itemsQuery.data])

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected
  }, [someVisibleSelected])

  const deliverVibe = useCallback(() => {
    const pending = pendingVibeRef.current
    if (!chat || !pending) return
    pendingVibeRef.current = null
    chat.open(pending.cwd, undefined, 'acceptEdits', pending.engine)
    chat.send(pending.seed, undefined, pending.displayText)
    setFloating(true)
    setMinimized(false)
  }, [chat, setFloating, setMinimized])

  useEffect(() => {
    if (chat && pendingVibeRef.current) deliverVibe()
  }, [chat, deliverVibe])

  const openVibe = (prompt = '') => {
    setVibeInitialPrompt(prompt)
    setVibeOpen(true)
  }

  const startVibe = (prompt: string, engine: ReqpoolVibeEngine) => {
    const repo = selfRepoQuery.data
    if (!repo?.exists) return
    const repoRoot = repo.path.replace(/[\\/]+$/, '')
    pendingVibeRef.current = {
      cwd: `${repoRoot}/frontend/src/features/reqpool`,
      seed: buildReqpoolVibeSeed(prompt),
      displayText: prompt,
      engine,
    }
    setVibeOpen(false)
    setVibeInitialPrompt('')
    if (chat) deliverVibe(); else activate()
  }

  const analyze = async (item: ReqItemView) => {
    setAnalyzingId(item.id)
    try {
      const updated = await analyzeItem(item.id)
      setSelected(updated)
      await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
    } finally {
      setAnalyzingId(null)
    }
  }

  const clarify = async (item: ReqItemView) => {
    await startClarify(item.id)
    const params = new URLSearchParams({ title: item.title, rawInput: item.description ?? '', project: item.project ?? '', module: item.module ?? '', reqItemId: item.id })
    navigate(`/tools/prd-clarify?${params.toString()}`)
  }

  const openPrdQuestions = async (item: ReqItemView) => {
    if (!item.prdSessionId) return
    const session = prdSessionById.get(item.prdSessionId) ?? await getPrdSession(item.prdSessionId)
    if (session.questions.length === 0) {
      setEntryNotice('澄清问题仍在构建中，请稍候')
      window.setTimeout(() => setEntryNotice(''), 2200)
      return
    }
    setQuestionPrd({ item, session })
  }

  const startPrdClarifyAsync = async (item: ReqItemView, engine: AgentEngine) => {
    const prdSessionId = item.prdSessionId
    if (!prdSessionId) throw new Error('当前需求尚未关联 PRD 草稿')
    const original: PrdSessionView = await getPrdSession(prdSessionId)
    if (original.status !== 'DRAFT') throw new Error('只有 PRD 草稿可以开始澄清，请刷新后重试')
    if (!original.rawInput?.trim()) throw new Error('PRD 草稿缺少需求描述，请先在 PRD 工作台补充')

    setClarifyingPrdIds(current => new Set(current).add(prdSessionId))
    try {
      const started = await startClarifyFromDraft(prdSessionId, {
        title: original.title,
        rawInput: original.rawInput,
        project: original.project ?? undefined,
        module: original.module ?? undefined,
        engine,
        role: original.role ?? 'PRODUCT',
        reqType: original.reqType ?? 'NEW_MODULE',
        maxQuestions: original.maxQuestions > 0 ? original.maxQuestions : 5,
        clarifyMode: 'batch',
        businessFields: original.businessFields,
      })
      queryClient.setQueryData(['prd-session', prdSessionId], started)
      queryClient.setQueryData<PrdSessionView[]>(['prd-sessions', 'reqpool'], current => current?.map(session => session.id === prdSessionId ? started : session))
      queryClient.setQueryData<ReqItemView[]>(['reqpool'], current => current?.map(value => value.id === item.id ? { ...value, status: 'CLARIFYING', updatedAt: Date.now() } : value))

      let finished = false
      const finish = (notice?: string) => {
        if (finished) return
        finished = true
        setClarifyingPrdIds(current => {
          const next = new Set(current)
          next.delete(prdSessionId)
          return next
        })
        void queryClient.invalidateQueries({ queryKey: ['prd-session', prdSessionId] })
        void queryClient.invalidateQueries({ queryKey: ['prd-sessions', 'reqpool'] })
        void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] })
        void syncFromPrd().finally(() => queryClient.invalidateQueries({ queryKey: ['reqpool'] }))
        if (notice) {
          setEntryNotice(notice)
          window.setTimeout(() => setEntryNotice(''), 3200)
        }
      }

      runPrdClarify(prdSessionId, {
        onEvent(name) {
          if (name === 'done') finish('AI 已返回待澄清问题，点击紫色 PRD 节点即可回答')
          if (name === 'error') finish('PRD 澄清执行失败，请进入 PRD 工作台重试')
        },
        onError() { finish('PRD 澄清连接失败，请进入 PRD 工作台重试') },
        onClose() { finish() },
      }, engine)
    } catch (cause) {
      setClarifyingPrdIds(current => {
        const next = new Set(current)
        next.delete(prdSessionId)
        return next
      })
      throw cause
    }
  }

  const submitPrdAnswers = async (
    item: ReqItemView,
    session: PrdSessionView,
    history: QaPair[],
    extraInstructions?: string,
  ) => {
    const prdSessionId = item.prdSessionId
    if (!prdSessionId) throw new Error('当前需求尚未关联 PRD')
    const saved = await saveQaHistory(prdSessionId, history)
    setQuestionPrd(null)
    setGeneratingPrdIds(current => new Set(current).add(prdSessionId))

    const generatingSession = { ...saved, status: 'GENERATING' as const }
    queryClient.setQueryData(['prd-session', prdSessionId], generatingSession)
    queryClient.setQueryData<PrdSessionView[]>(['prd-sessions', 'reqpool'], current => current?.map(value => value.id === prdSessionId ? generatingSession : value))

    let finished = false
    const finish = (notice: string) => {
      if (finished) return
      finished = true
      setGeneratingPrdIds(current => {
        const next = new Set(current)
        next.delete(prdSessionId)
        return next
      })
      void queryClient.invalidateQueries({ queryKey: ['prd-session', prdSessionId] })
      void queryClient.invalidateQueries({ queryKey: ['prd-sessions', 'reqpool'] })
      void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] })
      void syncFromPrd().finally(() => queryClient.invalidateQueries({ queryKey: ['reqpool'] }))
      setEntryNotice(notice)
      window.setTimeout(() => setEntryNotice(''), 3200)
    }

    runPrdGenerate(prdSessionId, {
      onEvent(name) {
        if (name === 'done') finish('PRD 已生成，点击绿色 PRD 节点即可预览')
        if (name === 'error') finish('PRD 生成失败，请稍后重试')
      },
      onError() { finish('PRD 生成连接失败，请稍后重试') },
      onClose() {
        if (!finished) void getPrdSession(prdSessionId).then(latest => {
          if (latest.status === 'DONE') finish('PRD 已生成，点击绿色 PRD 节点即可预览')
        })
      },
    }, extraInstructions, false, session.engine ?? 'codex')
  }

  const startTddQuestionsAsync = (sessionId: string, engine: AgentEngine) => {
    setBuildingTddQuestionIds(current => new Set(current).add(sessionId))
    setFailedTddIds(current => {
      const next = new Set(current)
      next.delete(sessionId)
      return next
    })

    let finished = false
    let monitoring = false
    const complete = (session: PrdSessionView) => {
      if (finished) return
      finished = true
      setBuildingTddQuestionIds(current => {
        const next = new Set(current)
        next.delete(sessionId)
        return next
      })
      queryClient.setQueryData(['prd-session', sessionId], session)
      queryClient.setQueryData<PrdSessionView[]>(['prd-sessions', 'reqpool'], current => current?.map(value => value.id === sessionId ? session : value))
      if (session.devDocWorkStatus === 'ERROR') {
        setFailedTddIds(current => new Set(current).add(sessionId))
        setEntryNotice(session.devDocWorkError || '技术问题生成失败，点击红色 TDD 节点重试')
        window.setTimeout(() => setEntryNotice(''), 3200)
      } else if (session.devDocQaDraft.length === 0) {
        startTddGenerationAsync(sessionId, [], engine)
      } else {
        setEntryNotice(`已生成 ${session.devDocQaDraft.length} 个技术问题，点击橙色 TDD 节点集中回答`)
        window.setTimeout(() => setEntryNotice(''), 3200)
      }
    }

    const monitor = () => {
      if (finished || monitoring) return
      monitoring = true
      const deadline = Date.now() + 3 * 60_000
      const poll = () => {
        if (finished) return
        void getPrdSession(sessionId).then(session => {
          if (session.devDocWorkStatus !== 'BUILDING_QUESTIONS') complete(session)
          else if (Date.now() >= deadline) complete({ ...session, devDocWorkStatus: 'ERROR', devDocWorkError: '技术问题生成超时' })
          else window.setTimeout(poll, 1_500)
        }).catch(() => window.setTimeout(poll, 1_500))
      }
      poll()
    }

    generateDevDocQuestions(sessionId, '', 'initial', {
      onEvent(name) {
        if (name === 'done') void getPrdSession(sessionId).then(complete)
        if (name === 'error') void getPrdSession(sessionId).then(complete)
      },
      onError() { monitor() },
      onClose() { if (!finished) monitor() },
    }, engine, true)
  }

  const startTddGenerationAsync = (
    sessionId: string,
    history: QaPair[],
    engine: AgentEngine,
    extraInstructions?: string,
  ) => {
    const baselineGeneratedAt = prdSessionById.get(sessionId)?.devDocGeneratedAt ?? 0
    setGeneratingTddIds(current => new Set(current).add(sessionId))
    setFailedTddIds(current => {
      if (!current.has(sessionId)) return current
      const next = new Set(current)
      next.delete(sessionId)
      return next
    })

    let finished = false
    let monitoring = false
    const finish = (success: boolean, notice: string) => {
      if (finished) return
      finished = true
      if (success) {
        queryClient.setQueriesData<DeliveryOverview>({ queryKey: ['delivery-overview'] }, current => {
          if (!current) return current
          return {
            ...current,
            requirements: current.requirements.map(requirement => requirement.id === sessionId
              ? {
                  ...requirement,
                  stages: {
                    ...requirement.stages,
                    tddClarify: { ...requirement.stages.tddClarify, status: 'COMPLETE', score: 100, note: '编码前关键技术决策已由开发者确认' },
                    tdd: { ...requirement.stages.tdd, status: 'COMPLETE', score: 100, updatedAt: Date.now(), note: 'TDD 已生成' },
                  },
                }
              : requirement),
          }
        })
      }
      setGeneratingTddIds(current => {
        const next = new Set(current)
        next.delete(sessionId)
        return next
      })
      setFailedTddIds(current => {
        const next = new Set(current)
        if (success) next.delete(sessionId); else next.add(sessionId)
        return next
      })
      void queryClient.invalidateQueries({ queryKey: ['prd-session', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['prd-sessions', 'reqpool'] })
      void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] })
      setEntryNotice(notice)
      window.setTimeout(() => setEntryNotice(''), 3200)
    }

    const monitorBackgroundResult = () => {
      if (finished || monitoring) return
      monitoring = true
      const deadline = Date.now() + 5 * 60_000
      const poll = () => {
        if (finished) return
        void getPrdSession(sessionId).then(latest => {
          if ((latest.devDocGeneratedAt ?? 0) > baselineGeneratedAt) {
            finish(true, 'TDD 已生成，点击绿色 TDD 节点即可预览')
          } else if (Date.now() >= deadline) {
            finish(false, 'TDD 后台生成超时，请点击红色节点重试；已提交答案会自动恢复')
          } else {
            window.setTimeout(poll, 2_000)
          }
        }).catch(() => {
          if (Date.now() >= deadline) finish(false, '暂时无法确认 TDD 生成结果，请稍后重试')
          else window.setTimeout(poll, 2_000)
        })
      }
      poll()
    }

    startGenerateDevDoc(sessionId, extraInstructions, false, history, true, {
      onEvent(name, data) {
        if (name === 'done') finish(true, 'TDD 已生成，点击绿色 TDD 节点即可预览')
        if (name === 'error') {
          const message = typeof data === 'object' && data && 'message' in data && typeof data.message === 'string'
            ? data.message
            : 'TDD 生成失败，请重新作业'
          finish(false, message)
        }
      },
      onError() { monitorBackgroundResult() },
      onClose() {
        if (!finished) monitorBackgroundResult()
      },
    }, engine, true)
  }

  const remove = async (item: ReqItemView) => {
    const ok = await confirm({
      title: '删除当前需求',
      description: item.prdSessionId
        ? `确认删除“${item.title}”？仅删除需求中枢记录，关联 PRD 仍会保留。`
        : `确认删除“${item.title}”？此操作不可撤销。`,
      confirmText: '确认删除',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteItem(item.id)
    setSelectedIds(current => {
      if (!current.has(item.id)) return current
      const next = new Set(current)
      next.delete(item.id)
      return next
    })
    setSelected(null)
    await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
  }

  const toggleSelected = (id: string) => {
    setBulkDeleteError('')
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleVisible = () => {
    setBulkDeleteError('')
    setSelectedIds(current => {
      const next = new Set(current)
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const removeSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const selectedItems = items.filter(item => selectedIds.has(item.id))
    const linkedCount = selectedItems.filter(item => item.prdSessionId).length
    const ok = await confirm({
      title: `批量删除 ${ids.length} 条需求`,
      description: linkedCount > 0
        ? `其中 ${linkedCount} 条关联了 PRD。删除只会移除需求中枢记录，关联 PRD 仍会保留；其余记录删除后不可恢复。`
        : '删除后不可恢复，请确认所选需求无需继续保留。',
      confirmText: `确认删除 ${ids.length} 条`,
      variant: 'destructive',
    })
    if (!ok) return
    setBulkDeleteError('')
    setBulkDeleting(true)
    try {
      await deleteItems(ids)
      if (selected && selectedIds.has(selected.id)) setSelected(null)
      setSelectedIds(new Set())
      await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
    } catch (cause) {
      setBulkDeleteError(cause instanceof Error ? cause.message : '批量删除失败，请稍后重试')
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleQuickSaved = async (title: string) => {
    setQuickEntryOpen(false)
    setEntryNotice(`“${title}”已保存为需求草稿`)
    await queryClient.invalidateQueries({ queryKey: ['reqpool'] })
    window.setTimeout(() => setEntryNotice(''), 2400)
  }

  const handleAssign = async (itemId: string, userId: number | null) => {
    setAssigningId(itemId)
    try {
      const updated = await assignItem(itemId, userId)
      queryClient.setQueryData<ReqItemView[]>(['reqpool'], current =>
        current?.map(item => item.id === updated.id ? updated : item) ?? [updated])
      setSelected(current => current?.id === updated.id ? updated : current)
    } finally {
      setAssigningId(null)
    }
  }

  const handleDeadline = async (itemId: string, deadline: string) => {
    setDeadlineSavingId(itemId)
    try {
      const updated = await updateItem(itemId, { deadline })
      queryClient.setQueryData<ReqItemView[]>(['reqpool'], current =>
        current?.map(item => item.id === updated.id ? updated : item) ?? [updated])
      setSelected(current => current?.id === updated.id ? updated : current)
    } finally {
      setDeadlineSavingId(null)
    }
  }

  return (
    <div className="min-h-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-300 dark:shadow-none"><Sparkles className="h-4.5 w-4.5" /></div><div><div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight">AI 需求中枢</h1><span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />实时同步</span></div><p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">一套标准收口需求，一条证据链还原真实进度</p></div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-muted)] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />同步证据</button>
            <button onClick={() => openVibe('调整需求中枢当前页面的字段与展示方式：')} className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300"><Wand2 className="h-3.5 w-3.5" />AI 调整页面</button>
            <div className="relative">
              <button onClick={() => setEntryMenuOpen(open => !open)} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-violet-700"><Plus className="h-3.5 w-3.5" />登记需求<ChevronDown className={`h-3 w-3 transition-transform ${entryMenuOpen ? 'rotate-180' : ''}`} /></button>
              {entryMenuOpen && <>
                <button aria-label="关闭登记方式菜单" className="fixed inset-0 z-20 cursor-default" onClick={() => setEntryMenuOpen(false)} />
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-72 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-1.5 shadow-xl">
                  <button onClick={() => { setEntryMenuOpen(false); setQuickEntryOpen(true) }} className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-violet-50 dark:hover:bg-violet-950/30"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><Sparkles className="h-4 w-4" /></span><span><span className="flex items-center gap-2 text-xs font-semibold">快速起草<span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">推荐</span></span><span className="mt-1 block text-[10px] leading-4 text-[var(--color-muted-foreground)]">选择系统模块，粘贴描述或附件，保存即完成登记</span></span></button>
                  <div className="mx-2 h-px bg-[var(--color-border)]" />
                  <button onClick={() => { setEntryMenuOpen(false); navigate('/tools/prd-clarify') }} className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-[var(--color-muted)]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"><Workflow className="h-4 w-4" /></span><span><span className="text-xs font-semibold">标准模式</span><span className="mt-1 block text-[10px] leading-4 text-[var(--color-muted-foreground)]">进入完整 PRD 流程，由 AI 澄清业务规则与验收标准</span></span></button>
                </div>
              </>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto px-5 lg:px-8">
          <button onClick={() => setView('table')} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium ${view === 'table' ? 'border-violet-600 text-violet-700 dark:text-violet-300' : 'border-transparent text-[var(--color-muted-foreground)]'}`}><LayoutList className="h-3.5 w-3.5" />统一工作台</button>
          <button onClick={() => setView('leader')} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium ${view === 'leader' ? 'border-violet-600 text-violet-700 dark:text-violet-300' : 'border-transparent text-[var(--color-muted-foreground)]'}`}><Presentation className="h-3.5 w-3.5" />领导视图</button>
          <div className="ml-auto hidden items-center gap-2 pb-2 text-[10px] text-[var(--color-muted-foreground)] sm:flex"><Database className="h-3 w-3" />PRD · TDD · Git · 文档已连接</div>
        </div>
      </header>

      <section className="px-5 pt-5 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-[var(--color-card)] shadow-sm dark:border-violet-900">
          <div className="absolute inset-y-0 left-0 w-1 bg-violet-600" />
          <div className="flex flex-col gap-3 p-3 pl-5 md:flex-row md:items-center">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><Bot className="h-4 w-4" /></span>
            <button type="button" onClick={() => openVibe()} className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-2 text-xs font-semibold">直接让 AI 调整需求中枢<span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Codex 默认</span></span>
              <span className="mt-0.5 block truncate text-sm text-[var(--color-muted-foreground)]">描述你想怎么改当前页面，打开简化版 Vibe Coding 对话框…</span>
            </button>
            <div className="flex flex-wrap gap-1.5">{['突出超期需求', '优化领导视图', '调整表格字段'].map(command => <button key={command} type="button" onClick={() => openVibe(command)} className="rounded-full bg-[var(--color-muted)] px-2.5 py-1.5 text-[10px] text-[var(--color-muted-foreground)] hover:text-violet-600">{command}</button>)}</div>
            <button type="button" onClick={() => openVibe()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-white" aria-label="打开需求中枢 Vibe Coding"><ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      {view === 'leader' ? <LeaderBrief items={items} overview={overview} /> : (
        <main className="px-5 pb-10 pt-4 lg:px-8">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [Target, '建议本期投入', counts.now, 'AI 统一价值判定', 'text-emerald-600', 'bg-emerald-50 dark:bg-emerald-950/30'],
              [Lightbulb, '待补充信息', counts.clarify, '缺少目标或口径', 'text-amber-600', 'bg-amber-50 dark:bg-amber-950/30'],
              [Workflow, '正在交付', counts.delivery, 'PRD / TDD / 代码同步', 'text-violet-600', 'bg-violet-50 dark:bg-violet-950/30'],
              [ShieldAlert, '高风险事项', counts.risk, '需要负责人介入', 'text-rose-600', 'bg-rose-50 dark:bg-rose-950/30'],
            ].map(([Icon, label, value, hint, color, bg]) => { const MetricIcon = Icon as typeof Target; return <div key={String(label)} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"><span className={`grid h-9 w-9 place-items-center rounded-lg ${bg}`}><MetricIcon className={`h-4 w-4 ${color}`} /></span><div><div className="flex items-baseline gap-1.5"><span className="text-xl font-semibold tabular-nums">{String(value)}</span><span className="text-xs text-[var(--color-muted-foreground)]">{String(label)}</span></div><div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">{String(hint)}</div></div></div> })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1 lg:max-w-xs"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索需求、系统、负责人…" className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] pl-9 pr-3 text-xs outline-none focus:border-violet-400" /></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative"><Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" /><select value={decisionFilter} onChange={event => setDecisionFilter(event.target.value as Decision | '')} className="h-9 appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] pl-8 pr-8 text-xs outline-none"><option value="">全部判定</option><option value="NOW">建议投入</option><option value="CLARIFY">补充信息</option><option value="PLAN">进入排期</option><option value="PARK">暂不投入</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" /></label>
                <label className="relative"><select value={status} onChange={event => setStatus(event.target.value as ReqStatus | '')} className="h-9 appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] pl-3 pr-8 text-xs outline-none"><option value="">全部阶段</option>{Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" /></label>
                {(decisionFilter || status || query) && <button onClick={() => { setDecisionFilter(''); setStatus(''); setQuery('') }} className="h-9 px-2 text-[10px] text-violet-600">清除筛选</button>}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <DocumentStatusLegend />
                <button onClick={() => portfolioMutation.mutate()} disabled={portfolioMutation.isPending || items.length === 0} className="flex h-9 items-center gap-1.5 rounded-lg border border-violet-200 px-3 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/30">{portfolioMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}重算优先级</button>
                <button onClick={() => setStudioOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]" title="字段与视图"><Settings2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            {selectedIds.size > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-violet-200 bg-violet-50/70 px-4 py-2.5 dark:border-violet-900 dark:bg-violet-950/20"><span className="text-xs font-semibold text-violet-700 dark:text-violet-300">已选择 {selectedIds.size} 条需求</span><span className="text-[10px] text-[var(--color-muted-foreground)]">可跨筛选条件保留选择</span><div className="ml-auto flex items-center gap-2"><button type="button" disabled={bulkDeleting} onClick={() => setSelectedIds(new Set())} className="rounded-lg px-2.5 py-1.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/70 disabled:opacity-40 dark:hover:bg-black/15">取消选择</button><button type="button" disabled={bulkDeleting} onClick={() => void removeSelected()} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">{bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}批量删除</button></div></div>}
            {bulkDeleteError && <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[10px] text-rose-600 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-300">{bulkDeleteError}</div>}

            {itemsQuery.isLoading ? <div className="grid min-h-72 place-items-center"><div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />正在汇总需求与交付证据…</div></div> : filteredItems.length === 0 ? (
              <div className="grid min-h-72 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40"><TableProperties className="h-5 w-5" /></span><h3 className="mt-4 text-sm font-semibold">{items.length === 0 ? '建立第一份统一需求台账' : '没有符合条件的需求'}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[var(--color-muted-foreground)]">{items.length === 0 ? '可以登记真实需求，或载入演示数据体验统一判定、证据同步和领导汇报。' : '尝试清除筛选，或让 AI 为你创建新的展示视图。'}</p>{items.length === 0 && <div className="mt-4 flex justify-center gap-2"><button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-muted)]">载入演示数据</button><button onClick={() => setQuickEntryOpen(true)} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white">快速登记需求</button></div>}</div></div>
            ) : (
              <div className="overflow-x-auto">
                <div className="divide-y divide-[var(--color-border)] md:hidden">
                  {filteredItems.map(item => {
                    const requirement = deliveryFor(item, overview)
                    const session = item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined
                    return <MobileRequirementCard key={item.id} item={item} requirement={requirement} prdSession={session} selected={selectedIds.has(item.id)} prdRunning={!!item.prdSessionId && (clarifyingPrdIds.has(item.prdSessionId) || generatingPrdIds.has(item.prdSessionId))} tddBuilding={!!item.prdSessionId && buildingTddQuestionIds.has(item.prdSessionId)} tddGenerating={!!item.prdSessionId && generatingTddIds.has(item.prdSessionId)} tddFailed={!!item.prdSessionId && failedTddIds.has(item.prdSessionId)} onToggle={() => toggleSelected(item.id)} onOpen={() => setSelected(item)} onDelete={() => void remove(item)} onStartPrd={engine => startPrdClarifyAsync(item, engine)} onAnswerPrd={() => void openPrdQuestions(item)} onPreviewPrd={() => setPreviewPrd(item)} onStartTdd={engine => item.prdSessionId && startTddQuestionsAsync(item.prdSessionId, engine)} onAnswerTdd={() => requirement && setTddWork(requirement)} onPreviewTdd={() => setPreviewTdd(item)} />
                  })}
                </div>
                <table className="hidden w-full min-w-[1080px] border-collapse text-left md:table">
                  <thead><tr className="bg-[var(--color-muted)]/55 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
                    <th className="w-10 px-3 py-3"><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={visibleIds.length === 0} className="h-3.5 w-3.5 cursor-pointer rounded border-[var(--color-border)] accent-violet-600 disabled:cursor-not-allowed" aria-label={allVisibleSelected ? '取消选择当前筛选结果' : '选择当前筛选结果'} title="全选当前筛选结果" /></th>
                    {enabled('decision') && <th className="w-[128px] px-4 py-3">统一判定</th>}
                    {enabled('requirement') && <th className="min-w-[260px] px-4 py-3">需求事实</th>}
                    {enabled('value') && <th className="min-w-[230px] px-4 py-3">业务价值</th>}
                    {enabled('owner') && <th className="w-[145px] px-4 py-3">责任与时间</th>}
                    {enabled('delivery') && <th className="w-[205px] px-4 py-3">交付证据</th>}
                    {enabled('risk') && <th className="w-[190px] px-4 py-3">风险与下一步</th>}
                    <th className="w-12 px-2 py-3" />
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--color-border)]">{filteredItems.map(item => {
                    const insight = parseInsight(item.aiInsight)
                    const requirement = deliveryFor(item, overview)
                    const session = item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined
                    const missingOwner = !item.assignee
                    const factQuality = evaluateRequirementFacts(item, session)
                    const factRisk = factQuality.score < 75 && factQuality.deductions.length > 0
                      ? `事实质量 ${factQuality.score} 分：${factQuality.deductions[0].reason}`
                      : null
                    const risk = requirement?.staleReasons[0] || factRisk || (missingOwner ? '尚未明确唯一负责人' : item.status === 'DRAFT' ? '需补齐验收口径' : '暂无新增风险')
                    return <tr key={item.id} onClick={() => setSelected(item)} className={`group cursor-pointer align-top transition-colors hover:bg-violet-50/35 dark:hover:bg-violet-950/10 ${selectedIds.has(item.id) ? 'bg-violet-50/65 dark:bg-violet-950/20' : ''} ${density === 'compact' ? '[&>td]:py-2.5' : '[&>td]:py-4'}`}>
                      <td className="px-3"><input type="checkbox" checked={selectedIds.has(item.id)} onClick={event => event.stopPropagation()} onChange={() => toggleSelected(item.id)} className="h-3.5 w-3.5 cursor-pointer rounded border-[var(--color-border)] accent-violet-600" aria-label={`选择需求：${item.title}`} /></td>
                      {enabled('decision') && <td className="px-4"><DecisionBadge decision={decisionOf(item)} /></td>}
                      {enabled('requirement') && <td className="px-4"><div className="flex items-start gap-2.5"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"><FileText className="h-3.5 w-3.5" /></span><div className="min-w-0"><div className="line-clamp-2 text-xs font-semibold leading-5">{item.title}</div><div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span><FactQualityBadge item={item} session={session} /><span className="max-w-[140px] truncate text-[10px] text-[var(--color-muted-foreground)]">{item.project || '待归属'} · {item.module || '待归类'}</span></div></div></div></td>}
                      {enabled('value') && <td className="px-4"><p className="line-clamp-2 text-xs leading-5 text-[var(--color-foreground)]/85">{insight?.reason || excerpt(item.description)}</p><div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-muted-foreground)]"><TrendingUp className="h-3 w-3 text-violet-500" />ROI {insight?.roi === 'HIGH' ? '高' : insight?.roi === 'LOW' ? '低' : '待验证'}{insight?.estimatedHours ? ` · ${insight.estimatedHours}h` : ''}</div></td>}
                      {enabled('owner') && <td className="px-4"><AssigneeCell item={item} users={usersQuery.data ?? []} loading={usersQuery.isLoading} unavailable={usersQuery.isError} saving={assigningId === item.id} onAssign={userId => handleAssign(item.id, userId)} /><DeadlineEditor item={item} saving={deadlineSavingId === item.id} onSave={deadline => handleDeadline(item.id, deadline)} /></td>}
                      {enabled('delivery') && <td className="px-4"><DeliveryTrack item={item} requirement={requirement} prdSession={item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined} prdRunning={!!item.prdSessionId && (clarifyingPrdIds.has(item.prdSessionId) || generatingPrdIds.has(item.prdSessionId))} tddBuilding={!!item.prdSessionId && buildingTddQuestionIds.has(item.prdSessionId)} tddGenerating={!!item.prdSessionId && generatingTddIds.has(item.prdSessionId)} tddFailed={!!item.prdSessionId && failedTddIds.has(item.prdSessionId)} onStartPrd={engine => startPrdClarifyAsync(item, engine)} onAnswerPrd={() => void openPrdQuestions(item)} onPreviewPrd={() => setPreviewPrd(item)} onStartTdd={engine => item.prdSessionId && startTddQuestionsAsync(item.prdSessionId, engine)} onAnswerTdd={() => requirement && setTddWork(requirement)} onPreviewTdd={() => setPreviewTdd(item)} /></td>}
                      {enabled('risk') && <td className="px-4"><div className={`flex items-start gap-1.5 text-[11px] leading-5 ${risk.includes('暂无') ? 'text-[var(--color-muted-foreground)]' : 'text-amber-700 dark:text-amber-300'}`}>{risk.includes('暂无') ? <CircleCheck className="mt-1 h-3 w-3 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-1 h-3 w-3 shrink-0" />}<span className="line-clamp-2">{risk}</span></div><div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]"><Clock3 className="h-3 w-3" />{relativeTime(item.updatedAt)}自动更新</div></td>}
                      <td className="px-2"><div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"><button onClick={event => { event.stopPropagation(); void remove(item) }} className="rounded-lg p-2 text-[var(--color-muted-foreground)] hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30" title="删除当前需求" aria-label={`删除需求：${item.title}`}><Trash2 className="h-3.5 w-3.5" /></button><button onClick={event => { event.stopPropagation(); setSelected(item) }} className="rounded-lg p-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]" title="查看需求详情" aria-label={`查看需求：${item.title}`}><ChevronRight className="h-4 w-4" /></button></div></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3 text-[10px] text-[var(--color-muted-foreground)]"><span>共 {filteredItems.length} / {items.length} 项 · 当前展示 {columns} 个标准字段组</span><div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><Radio className="h-3 w-3 text-emerald-500" />证据自动同步</span><button onClick={() => setStudioOpen(true)} className="flex items-center gap-1 text-violet-600"><PanelRightOpen className="h-3 w-3" />配置视图</button></div></div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[var(--color-muted-foreground)]"><span>判定模型：战略匹配 30% · 用户影响 25% · 可量化收益 25% · 成本与风险 20%</span><span>最后证据同步：{overview?.generatedAt ? relativeTime(overview.generatedAt) : '等待数据源'}</span></div>
        </main>
      )}

      {studioOpen && <AiStudio fields={fields} density={density} onFieldsChange={setFields} onDensityChange={setDensity} onClose={() => setStudioOpen(false)} />}
      {selected && <RequirementDrawer item={selected} requirement={deliveryFor(selected, overview)} prdSession={selected.prdSessionId ? prdSessionById.get(selected.prdSessionId) : undefined} analyzing={analyzingId === selected.id} prdRunning={!!selected.prdSessionId && (clarifyingPrdIds.has(selected.prdSessionId) || generatingPrdIds.has(selected.prdSessionId))} tddBuilding={!!selected.prdSessionId && buildingTddQuestionIds.has(selected.prdSessionId)} tddGenerating={!!selected.prdSessionId && generatingTddIds.has(selected.prdSessionId)} tddFailed={!!selected.prdSessionId && failedTddIds.has(selected.prdSessionId)} onClose={() => setSelected(null)} onAnalyze={() => analyze(selected)} onClarify={() => clarify(selected)} onStartPrd={engine => startPrdClarifyAsync(selected, engine)} onAnswerPrd={() => void openPrdQuestions(selected)} onPreviewPrd={() => setPreviewPrd(selected)} onStartTdd={engine => { const id = selected.prdSessionId; if (id) { setSelected(null); startTddQuestionsAsync(id, engine) } }} onAnswerTdd={() => { const requirement = deliveryFor(selected, overview); if (requirement) { setSelected(null); setTddWork(requirement) } }} onPreviewTdd={() => { setSelected(null); setPreviewTdd(selected) }} onViewPrd={() => selected.prdSessionId && navigate(`/tools/prd-clarify?viewSession=${selected.prdSessionId}`)} onDelete={() => remove(selected)} />}
      {quickEntryOpen && <QuickRequirementDialog onClose={() => setQuickEntryOpen(false)} onSaved={handleQuickSaved} />}
      {vibeOpen && <ReqpoolVibeDialog initialPrompt={vibeInitialPrompt} repoAvailable={selfRepoQuery.data?.exists === true} activating={!chat && pendingVibeRef.current != null} onClose={() => setVibeOpen(false)} onSubmit={startVibe} />}
      {questionPrd && <PrdQuestionsModal item={questionPrd.item} session={questionPrd.session} onClose={() => setQuestionPrd(null)} onSubmit={(history, extraInstructions) => submitPrdAnswers(questionPrd.item, questionPrd.session, history, extraInstructions)} />}
      {previewPrd && <MarkdownDocumentModal item={previewPrd} kind="PRD" onClose={() => setPreviewPrd(null)} onOpenFull={() => { const id = previewPrd.prdSessionId; setPreviewPrd(null); if (id) navigate(`/tools/prd-clarify?viewSession=${encodeURIComponent(id)}`) }} />}
      {tddWork && <DeliveryStageDialog requirement={tddWork} stage="tddClarify" onStartTddGeneration={startTddGenerationAsync} onClose={() => { setTddWork(null); void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] }); void queryClient.invalidateQueries({ queryKey: ['prd-sessions', 'reqpool'] }) }} />}
      {previewTdd && <MarkdownDocumentModal item={previewTdd} kind="TDD" onClose={() => setPreviewTdd(null)} />}
      {entryNotice && <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-xs text-white shadow-xl"><CircleCheck className="h-4 w-4 text-emerald-400" />{entryNotice}</div>}
    </div>
  )
}
