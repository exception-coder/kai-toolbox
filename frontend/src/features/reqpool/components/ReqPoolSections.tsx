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
  Paperclip,
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
import { EngineIcon } from '@/features/claude-chat/public-api'
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
import { PlanningAssessmentSection } from './PlanningAssessmentSection'
import { analysisErrorMessage } from '../lib/analysisError'

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
  DRAFT: { label: '待受理', cls: 'text-[var(--color-muted-foreground)]' },
  CLARIFYING: { label: '澄清中', cls: 'text-amber-700 dark:text-amber-300' },
  PRD_READY: { label: '已准入', cls: 'text-[var(--color-foreground)]/75' },
  IN_DEV: { label: '交付中', cls: 'text-[var(--color-foreground)]/75' },
  DONE: { label: '已交付', cls: 'text-emerald-700 dark:text-emerald-300' },
  CANCELLED: { label: '已归档', cls: 'text-[var(--color-muted-foreground)]' },
}

const DECISION_META: Record<Decision, { label: string; hint: string; cls: string; dot: string }> = {
  NOW: { label: '建议投入', hint: '价值明确 · 当前推进', cls: 'text-[var(--color-foreground)]', dot: 'bg-[var(--color-primary)]' },
  CLARIFY: { label: '补充信息', hint: '判定条件尚不完整', cls: 'text-[var(--color-foreground)]', dot: 'bg-amber-500' },
  PLAN: { label: '进入排期', hint: '价值成立 · 等待产能', cls: 'text-[var(--color-foreground)]', dot: 'bg-[var(--color-muted-foreground)]' },
  PARK: { label: '暂不投入', hint: '收益不足或已关闭', cls: 'text-[var(--color-muted-foreground)]', dot: 'bg-[var(--color-muted-foreground)]' },
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


import { DeliveryTrack } from './ReqPoolDeliverySections'
export {
  DeliveryTrack,
  DocumentStatusLegend,
  MarkdownDocumentModal,
  PrdQuestionsModal,
  RequirementLineage,
  type RequirementLineageActions,
  type RequirementLineageRunState,
} from './ReqPoolDeliverySections'

export function DecisionBadge({ decision }: { decision: Decision }) {
  const meta = DECISION_META[decision]
  return (
    <div className={`inline-flex min-w-[98px] flex-col ${meta.cls}`}>
      <span className="flex items-center gap-1.5 text-xs font-semibold"><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
      <span className="mt-0.5 text-[10px] opacity-75">{meta.hint}</span>
    </div>
  )
}

const FACT_QUALITY_TONE: Record<FactQualityResult['level'], { badge: string; bar: string }> = {
  READY: { badge: 'border-transparent text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  ASSUMPTIONS: { badge: 'border-transparent text-[var(--color-muted-foreground)]', bar: 'bg-[var(--color-muted-foreground)]' },
  DECISION: { badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300', bar: 'bg-amber-500' },
}

function FactQualityDetails({ quality }: { quality: FactQualityResult }) {
  const tone = FACT_QUALITY_TONE[quality.level]
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div><div className="text-[10px] text-[var(--color-muted-foreground)]">规格成熟度</div><div className="mt-0.5 flex items-baseline gap-1"><span className="text-2xl font-semibold tabular-nums">{quality.score}</span><span className="text-[10px] text-[var(--color-muted-foreground)]">/ 100 · {quality.grade}级</span></div><div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{quality.maturityLabel}</div></div>
        <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold ${tone.badge}`}>{quality.levelLabel}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${quality.score}%` }} /></div>
      <p className="mt-3 text-[10px] leading-5 text-[var(--color-foreground)]/80">{quality.readinessSummary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px]"><span className="rounded bg-[var(--color-muted)] px-2 py-1">{quality.reqTypeLabel} · {quality.reqTypeSourceLabel}</span><span className="max-w-full truncate rounded bg-[var(--color-muted)] px-2 py-1" title={quality.locationLabel}>{quality.locationLabel}</span></div>
      <div className="mt-4 space-y-2">
        {quality.criteria.map(item => {
          const deducted = item.weight - item.earned
          return <div key={item.key} className="border-t border-[var(--color-border)] py-2.5"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold">{item.label}</span><span className={`text-[10px] font-semibold tabular-nums ${deducted > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{item.earned}/{item.weight}</span></div><p className="mt-1 text-[9px] leading-4 text-[var(--color-muted-foreground)]">{item.reason}</p></div>
        })}
      </div>
      {quality.riskFlags.length > 0 && <div className="mt-3 border-l-2 border-amber-300 pl-3"><div className="text-[10px] font-semibold">实施中继续核查</div><p className="mt-1 text-[9px] leading-4 text-[var(--color-muted-foreground)]">{quality.riskFlags.join('；')}</p></div>}
      <p className="mt-3 text-[9px] leading-4 text-[var(--color-muted-foreground)]">准入口径：关键意图、存量定位、可观察验收和高影响决策独立判定。成熟度用于改进规格，不再以单一分数阻断开发；补充证据仅占 5 分。</p>
    </div>
  )
}
export function FactQualityBadge({ item, session }: { item: ReqItemView; session?: PrdSessionView }) {
  const quality = evaluateRequirementFacts(item, session)
  const tone = FACT_QUALITY_TONE[quality.level]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" onClick={event => event.stopPropagation()} className={`flex items-center gap-1 border px-1 py-0.5 text-[9px] font-medium tabular-nums ${tone.badge}`} title="查看开发准入与规格成熟度"><Gauge className="h-2.5 w-2.5" />规格 {quality.score}</button>
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
export function LeaderBrief({ items, overview }: { items: ReqItemView[]; overview?: DeliveryOverview }) {
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
      '以上结论由 AI 根据需求规格、执行方案与代码证据自动生成。',
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
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300"><Sparkles className="h-4 w-4" /> AI 已根据最新需求规格 / 执行方案 / 代码证据生成</div>
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
              const insight = effectiveInsight(item)
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
export function AiStudio({ fields, density, onFieldsChange, onDensityChange, onClose }: {
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
    if (text.includes('只看进展')) onFieldsChange(fields.map(field => ({ ...field, enabled: field.id === 'delivery' || field.id === 'risk' })))
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
              {['只看本周风险', '生成领导周报', '只看进展与风险'].map(text => <button key={text} onClick={() => setPrompt(text)} className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:border-violet-300 hover:text-violet-600">{text}</button>)}
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
export function RequirementDrawer({ item, requirement, prdSession, analyzing, prdRunning, tddBuilding, tddGenerating, tddFailed, onClose, onAnalyze, onClarify, onStartPrd, onAnswerPrd, onPreviewPrd, onStartTdd, onAnswerTdd, onPreviewTdd, onViewPrd, onDelete }: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
  analyzing: boolean
  prdRunning: boolean
  tddBuilding: boolean
  tddGenerating: boolean
  tddFailed: boolean
  onClose: () => void
  onAnalyze: (engine: AgentEngine) => Promise<void>
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
  const decision = decisionOf(item)
  const factQuality = evaluateRequirementFacts(item, prdSession)
  const labels = documentLabels
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="h-full w-full max-w-[520px] overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)]/95 px-5 py-4 backdrop-blur"><span className="text-xs font-medium text-[var(--color-muted-foreground)]">需求详情 · {item.id.slice(0, 8).toUpperCase()}</span><button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]"><X className="h-4 w-4" /></button></div>
        <div className="space-y-8 p-6">
          <div><div className="flex items-center justify-between gap-3"><DecisionBadge decision={decision} /><span className={`text-[10px] font-medium ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span></div><h2 className="mt-5 text-xl font-semibold leading-8">{item.title}</h2><RequirementDescription content={item.description} /></div>
          <dl className="grid grid-cols-2 border-y border-[var(--color-border)]">
            {[[Building2, '系统 / 模块', `${item.project || '待归属'} / ${item.module || '待归类'}`], [UserRound, '唯一负责人', item.assignee || '待指派'], [CalendarDays, '承诺时间', dateLabel(item.deadline)], [Radio, '数据来源', item.prdSessionId ? `${labels.specification}自动同步` : '统一登记']].map(([Icon, label, value], index) => { const CellIcon = Icon as typeof Building2; return <div key={String(label)} className={`py-3 ${index % 2 === 0 ? 'pr-4' : 'border-l border-[var(--color-border)] pl-4'} ${index > 1 ? 'border-t border-[var(--color-border)]' : ''}`}><dt className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]"><CellIcon className="h-3 w-3" />{String(label)}</dt><dd className="mt-1 text-xs font-medium">{String(value)}</dd></div> })}
          </dl>
          <section aria-label="规格成熟度"><FactQualityDetails quality={factQuality} /></section>
          <PlanningAssessmentSection item={item} />
          <InsightAnalysisPanel item={item} analyzing={analyzing} onAnalyze={onAnalyze} />
          <div><div className="mb-3 flex items-center justify-between text-xs font-semibold"><span>交付证据链</span><span className="text-[10px] font-normal text-[var(--color-muted-foreground)]">点击节点直接操作</span></div><div className="border-y border-[var(--color-border)] py-4"><DeliveryTrack item={item} requirement={requirement} prdSession={prdSession} prdRunning={prdRunning} tddBuilding={tddBuilding} tddGenerating={tddGenerating} tddFailed={tddFailed} onStartPrd={onStartPrd} onAnswerPrd={onAnswerPrd} onPreviewPrd={onPreviewPrd} onStartTdd={onStartTdd} onAnswerTdd={onAnswerTdd} onPreviewTdd={onPreviewTdd} /></div></div>
          <div className="flex flex-wrap gap-2">
            {!item.prdSessionId && item.status === 'DRAFT' && <button onClick={onClarify} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-medium text-white"><Sparkles className="h-3.5 w-3.5" />进入 AI 澄清</button>}
            {item.prdSessionId && prdSession?.status === 'CLARIFYING' && prdSession.questions.length > 0 && <button onClick={onAnswerPrd} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-medium text-white"><Sparkles className="h-3.5 w-3.5" />回答澄清问题</button>}
            {item.prdSessionId && prdSession?.status === 'DONE' && <button onClick={onViewPrd} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-xs font-medium hover:bg-[var(--color-muted)]"><FileText className="h-3.5 w-3.5" />查看{labels.specification}</button>}
            <button onClick={onDelete} className="ml-auto flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-3.5 w-3.5" />删除</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function InsightAnalysisPanel({
  item,
  analyzing,
  onAnalyze,
}: {
  item: ReqItemView
  analyzing: boolean
  onAnalyze: (engine: AgentEngine) => Promise<void>
}) {
  const inheritedEngine: AgentEngine = item.aiInsightEngine === 'claude' ? 'claude' : 'codex'
  const [engine, setEngine] = useState<AgentEngine>(inheritedEngine)
  const [configuring, setConfiguring] = useState(false)
  const [error, setError] = useState('')
  const insight = parseInsight(item.aiInsight)
  const staleLabel = insightStaleLabel(item)
  const backgroundRun = item.insightRun

  useEffect(() => {
    setEngine(inheritedEngine)
    setError('')
  }, [inheritedEngine, item.id])

  const run = async () => {
    setError('')
    try {
      await onAnalyze(engine)
      setConfiguring(false)
    } catch (cause) {
      setError(analysisErrorMessage(cause, engine))
    }
  }

  return (
    <section className="border-y border-[var(--color-border)] py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-4 w-4 text-[var(--color-primary)]" />AI 判定依据</div>
        <button type="button" onClick={() => { setConfiguring(current => !current); setError('') }} disabled={analyzing} className="text-[10px] font-medium text-[var(--color-primary)] disabled:opacity-50">{analyzing ? `${engine === 'codex' ? 'Codex' : 'Claude'} 判定中…` : configuring ? '收起' : '更新需求评估'}</button>
      </div>

      {analyzing && <div className="mt-3 flex items-start gap-2 border-y border-[var(--color-border)] py-3 text-[10px] leading-4 text-[var(--color-muted-foreground)]"><Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-primary)]" /><span>后台正在{backgroundRun?.stage === 'QUEUED' ? '排队' : backgroundRun?.stage === 'DISCOVERING' ? '查询业务知识、Graphify、DDL 与路由' : '生成并校验价值判定'}。可以关闭面板或刷新页面，任务会继续执行并自动恢复进度；完成后将继续更新功能与规划工时。</span></div>}

      {!analyzing && backgroundRun?.status === 'FAILED' && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><p className="font-medium">上次后台判定未完成</p><p className="mt-1 break-words">{backgroundRun.errorMessage || '执行异常，可重新选择引擎后恢复。'}</p></div>}

      {configuring && (
        <div className="mt-3 border-y border-[var(--color-border)] py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium">选择执行引擎</p>
              <p className="mt-0.5 text-[9px] text-[var(--color-muted-foreground)]">{item.aiInsightEngine ? `已继承上次使用的 ${inheritedEngine === 'codex' ? 'Codex' : 'Claude Code'}` : '暂无历史记录，默认使用 Codex'}</p>
            </div>
            <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-0.5">
              {(['codex', 'claude'] as const).map(value => (
                <button key={value} type="button" disabled={analyzing} onClick={() => { setEngine(value); setError('') }} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors ${engine === value ? 'bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-muted-foreground)]'}`}>
                  <EngineIcon engine={value} className="h-3 w-3" title={value === 'codex' ? 'Codex' : 'Claude Code'} />
                  {value === 'codex' ? 'Codex' : 'Claude'}
                </button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button type="button" disabled={analyzing} onClick={() => void run()} className="inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {analyzing ? '正在更新判定' : `使用 ${engine === 'codex' ? 'Codex' : 'Claude'} 更新`}
            </button>
          </div>
        </div>
      )}

      {staleLabel && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">{staleLabel}</div>}
      <p className="mt-3 text-sm leading-6">{insight?.reason || '尚未生成跨需求价值分析。AI 将统一考虑战略匹配、用户影响、收益、成本与风险。'}</p>
      {item.aiInsightGeneratedAt && <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">生成于 {new Date(item.aiInsightGeneratedAt).toLocaleString()} · {item.aiInsightType === 'PORTFOLIO' ? '组合排序' : '单条分析'}{item.aiInsightEngine ? ` · ${item.aiInsightEngine === 'codex' ? 'Codex' : 'Claude Code'}` : ''}{item.aiInsightPromptVersion ? ` · ${item.aiInsightPromptVersion}` : ''}</p>}
      {insight?.impacts && <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">{insight.impacts.map(value => <span key={value} className="text-[10px] text-[var(--color-muted-foreground)]">{value}</span>)}</div>}
    </section>
  )
}

/** 需求描述可能是手工文本，也可能是规格探索同步的 Markdown，统一按安全 Markdown 阅读。 */
export function RequirementDescription({ content }: { content: string | null }) {
  const source = content?.trim() || ''
  const attachmentPattern = /^\[📎\s*附件[：:]\s*([^\]]+)]\(([^)]+)\)\s*$/gm
  const indexedAttachments = [...source.matchAll(attachmentPattern)]
  const legacyAttachments = indexedAttachments.length > 0 ? [] : [...source.matchAll(/^【附件[：:]\s*([^】]+)】\s*$/gm)]
  const attachments = indexedAttachments.length > 0 ? indexedAttachments : legacyAttachments
  const body = attachments.length > 0 ? source.slice(0, attachments[0].index).replace(/\n?---\s*$/, '').trim() : source
  return (
    <div className="mt-2">
      <MarkdownContent content={body || (attachments.length > 0 ? '需求内容见附件。' : '尚未补充需求描述。')} className="!h-auto !overflow-visible !p-0 text-sm text-[var(--color-muted-foreground)]" />
      {attachments.length > 0 && <div className="mt-3 border-t border-[var(--color-border)] pt-2" aria-label="需求附件">
        {attachments.map((attachment, index) => {
          const href = attachment[2] && /^(?:https?:\/\/|\/api\/)/i.test(attachment[2]) ? attachment[2] : undefined
          return <div key={`${attachment[1]}-${index}`} className="flex min-w-0 items-center gap-2 py-1.5 text-xs"><Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" /><span className="min-w-0 flex-1 truncate">{attachment[1]}</span>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">查看附件</a> : <span className="shrink-0 text-[var(--color-muted-foreground)]">原附件</span>}</div>
        })}
      </div>}
    </div>
  )
}
export function MobileRequirementCard({
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
  const insight = effectiveInsight(item)
  const factQuality = evaluateRequirementFacts(item, prdSession)
  const factRisk = factQuality.level === 'DECISION'
    ? factQuality.blockers[0] || '存在需要需求方判定的关键事项'
    : factQuality.riskFlags[0] || null
  const risk = requirement?.staleReasons[0]
    || factRisk
    || (!item.assignee ? '尚未明确唯一负责人' : item.status === 'DRAFT' ? '需补齐验收口径' : null)
  return (
    <article className={`p-4 transition-colors ${selected ? 'bg-[var(--color-primary)]/[0.055]' : ''}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--color-border)] accent-violet-600" aria-label={`选择需求：${item.title}`} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <h3 className="text-sm font-semibold leading-6">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-foreground)]/80">{insight?.reason || excerpt(item.description)}</p>
          <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">{DECISION_META[decisionOf(item)].label} · {item.project || '待归属'} · 规格 {factQuality.score}</p>
          {risk && <div className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-[var(--color-foreground)]/75"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /><span className="line-clamp-1">{risk}</span></div>}
        </button>
        <button type="button" onClick={onDelete} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-rose-50 hover:text-rose-500" aria-label={`删除需求：${item.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
        <div className="min-w-0 text-[10px] text-[var(--color-muted-foreground)]">
          <div className="truncate"><UserRound className="mr-1 inline h-3 w-3" />{item.assignee || '待指派负责人'}</div>
          <div className="mt-1"><CalendarDays className="mr-1 inline h-3 w-3" />{dateLabel(item.deadline)}</div>
        </div>
        <DeliveryTrack compact item={item} requirement={requirement} prdSession={prdSession} prdRunning={prdRunning} tddBuilding={tddBuilding} tddGenerating={tddGenerating} tddFailed={tddFailed} onStartPrd={onStartPrd} onAnswerPrd={onAnswerPrd} onPreviewPrd={onPreviewPrd} onStartTdd={onStartTdd} onAnswerTdd={onAnswerTdd} onPreviewTdd={onPreviewTdd} />
      </div>
    </article>
  )
}
export function AssigneeCell({
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
          title={boundUser ? `@${boundUser.username} · 双击重新指派` : '双击 @ 选择指派人'}
          onClick={event => event.stopPropagation()}
          onDoubleClick={event => {
            event.stopPropagation()
            setOpen(true)
          }}
        >
          <div className={`flex items-center gap-2 text-xs ${displayName ? '' : 'text-amber-600'}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-semibold ${displayName ? 'bg-[var(--color-muted)] text-[var(--color-foreground)]' : 'bg-amber-50 dark:bg-amber-950/40'}`}>
              {displayName?.slice(0, 1).toUpperCase() || '?'}
            </span>
            <span className="min-w-0 flex-1 truncate">{displayName || '双击 @ 指派'}</span>
            <AtSign className="h-3 w-3 shrink-0 text-violet-500 opacity-0 transition-opacity group-hover/assignee:opacity-100" />
          </div>
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
export function DeadlineEditor({
  item,
  prdSession,
  saving,
  onSave,
}: {
  item: ReqItemView
  prdSession?: PrdSessionView
  saving: boolean
  onSave: (deadline: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(item.deadline ?? '')
  const [error, setError] = useState('')
  const [engine, setEngine] = useState<AgentEngine>('codex')
  const [extraContext, setExtraContext] = useState('')
  const [estimating, setEstimating] = useState(false)
  const [estimation, setEstimation] = useState(prdSession?.devDocEstimation ?? null)

  useEffect(() => setDraft(item.deadline ?? ''), [item.deadline])
  useEffect(() => setEstimation(prdSession?.devDocEstimation ?? null), [prdSession?.devDocEstimation])

  const evaluationRunning = estimation?.workStatus === 'RUNNING'
  useEffect(() => {
    if (!evaluationRunning || !item.prdSessionId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const latest = await getPrdSession(item.prdSessionId!)
        if (cancelled) return
        setEstimation(latest.devDocEstimation)
        if (latest.devDocEstimation?.workStatus === 'RUNNING') timer = setTimeout(poll, 2000)
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4000)
      }
    }
    timer = setTimeout(poll, 1200)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [evaluationRunning, item.prdSessionId])

  const save = async (value = draft) => {
    setError('')
    try {
      await onSave(value)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '承诺时间保存失败')
    }
  }

  const estimate = async () => {
    if (!item.prdSessionId || estimating || evaluationRunning) return
    setEstimating(true)
    setError('')
    try {
      const updated = await estimateDevDocEffort(item.prdSessionId, extraContext.trim() || undefined, engine)
      setEstimation(updated.devDocEstimation)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 工时评估失败')
    } finally {
      setEstimating(false)
    }
  }

  const suggested = estimation && !estimation.stale ? suggestedCommitmentDate(estimation.hoursMax) : ''
  const confidenceLabel = estimation?.confidence === 'HIGH' ? '高' : estimation?.confidence === 'LOW' ? '低' : '中'

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); setDraft(item.deadline ?? ''); setError('') }}>
      <PopoverTrigger asChild>
        <button type="button" onClick={event => event.stopPropagation()} className={`group/deadline mt-2 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] hover:bg-[var(--color-muted)] ${item.deadline ? 'text-[var(--color-muted-foreground)]' : 'text-amber-600'}`} title="点击填写承诺时间">
          <CalendarDays className="h-3 w-3" />
          <span>{dateLabel(item.deadline)}</span>
          {evaluationRunning && <span className="flex items-center gap-1 text-violet-600"><Loader2 className="h-2.5 w-2.5 animate-spin" />AI评估中</span>}
          <span className="ml-auto text-[9px] text-violet-500 opacity-0 transition-opacity group-hover/deadline:opacity-100">编辑</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={5} className="max-h-[min(85vh,44rem)] w-[min(92vw,25rem)] overflow-y-auto p-0" onClick={event => event.stopPropagation()}>
        <div className="p-3">
        <div className="text-xs font-semibold">承诺完成时间</div>
        <p className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">用于风险识别、排期承诺和超期提醒。</p>
        <input type="date" autoFocus value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && draft) void save(); if (event.key === 'Escape') setOpen(false) }} className="mt-3 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs outline-none focus:border-violet-400" />
        <div className="mt-3 flex items-center justify-between">
          <button type="button" disabled={saving || !item.deadline} onClick={() => void save('')} className="text-[10px] text-rose-500 disabled:opacity-30">清除时间</button>
          <button type="button" disabled={saving || !draft} onClick={() => void save()} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-medium text-white disabled:opacity-40">{saving && <Loader2 className="h-3 w-3 animate-spin" />}保存</button>
        </div>
        </div>

        <div className="border-t border-[var(--color-border)] bg-violet-50/45 p-3 dark:bg-violet-950/15">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300"><Bot className="h-3.5 w-3.5" />AI 辅助编码工时评估</div><p className="mt-1 text-[9px] leading-4 text-[var(--color-muted-foreground)]">按 Codex / Claude Code 主导编码、人负责审查验证的协作口径估算，任务在后台运行。</p></div>
            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9px] text-violet-600 shadow-sm dark:bg-black/20">非承诺值</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['codex', 'claude'] as const).map(value => <button key={value} type="button" disabled={estimating || evaluationRunning} onClick={() => setEngine(value)} className={`rounded-lg border px-2.5 py-2 text-[10px] font-medium ${engine === value ? 'border-violet-400 bg-white text-violet-700 shadow-sm dark:bg-violet-950/60 dark:text-violet-300' : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]'}`}>{value === 'codex' ? 'Codex（默认）' : 'Claude Code'}</button>)}
          </div>
          <textarea value={extraContext} disabled={estimating || evaluationRunning} onChange={event => setExtraContext(event.target.value)} rows={2} placeholder="可选：补充必须兼容的旧逻辑、外部联调范围、验证限制…" className="mt-2 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-[10px] leading-4 outline-none focus:border-violet-400" />
          <button type="button" disabled={!item.prdSessionId || estimating || evaluationRunning} onClick={() => void estimate()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-[10px] font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">{estimating || evaluationRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{estimating ? '正在提交后台任务…' : evaluationRunning ? `后台评估中 · ${estimation?.workStatus === 'RUNNING' ? '可关闭弹框' : ''}` : estimation ? '重新评估 AI 编码工时' : '开始后台 AI 工时评估'}</button>
          {!item.prdSessionId && <p className="mt-2 text-center text-[9px] text-amber-600">请先关联或生成需求规格，才能建立估算证据链。</p>}

          {estimation && (
            <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-black/15">
              {evaluationRunning && <div className="mb-2 flex items-center gap-2 rounded-lg bg-violet-50 px-2.5 py-2 text-[9px] text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /><div><div className="font-semibold">Code Agent 正在后台核查并估算</div><div>可以关闭弹框，完成后结果会自动刷新。</div></div></div>}
              {estimation.workStatus === 'ERROR' && <div className="mb-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[9px] leading-4 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300"><div className="font-semibold">后台评估失败</div><div>{estimation.workError || '请重新发起评估'}</div></div>}
              {estimation.estimatedAt > 0 && evaluationRunning && <div className="mb-2 text-[9px] text-[var(--color-muted-foreground)]">下方暂时保留上一版结果，后台完成后将自动替换。</div>}
              {estimation.estimatedAt > 0 && estimation.stale && <div className="mb-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[9px] leading-4 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><div className="font-semibold">评估已过期，请重新评估后再承诺</div><div>{(estimation.staleReasons?.length ? estimation.staleReasons : ['需求规格或执行方案已变化']).join('；')}</div></div>}
              {estimation.estimatedAt > 0 && estimation.sourceSessionId && estimation.sourceSessionId !== item.prdSessionId && <div className="mb-2 text-[9px] text-violet-600 dark:text-violet-300">评估依据：{estimation.sourceTitle || '最新需求规格修订版'}</div>}
              {estimation.estimatedAt > 0 && <div className="flex items-end justify-between gap-3"><div><div className="text-[9px] text-[var(--color-muted-foreground)]">AI Code Agent 协作工时</div><div className="mt-1 text-lg font-semibold tabular-nums">{estimation.hoursMin}–{estimation.hoursMax}<span className="ml-1 text-[10px] font-normal">小时</span></div></div><div className="text-right text-[9px] text-[var(--color-muted-foreground)]">约 {formatPersonDays(estimation.hoursMin)}–{formatPersonDays(estimation.hoursMax)} 人日<br />信心：{confidenceLabel}</div></div>}
              {estimation.estimatedAt > 0 && <div className={`mt-2 rounded-lg px-2.5 py-2 text-[9px] leading-4 ${estimation.codeInspected ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>{estimation.codeInspected ? `已核查本地代码 · ${estimation.inspectedFiles?.length ?? 0} 个关键文件` : '未命中本地项目，本次主要依据需求规格 / 执行方案估算'}{estimation.codeEvidenceSummary ? `：${estimation.codeEvidenceSummary}` : ''}</div>}
              {estimation.estimatedAt > 0 && estimation.reasoning && <p className="mt-2 text-[9px] leading-4 text-[var(--color-muted-foreground)]">{estimation.reasoning}</p>}
              {estimation.estimatedAt > 0 && estimation.breakdown.length > 0 && <div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">{estimation.breakdown.slice(0, 6).map((part, index) => <div key={`${part.item}-${index}`} className="flex items-center justify-between gap-2 text-[9px]"><span className="min-w-0 truncate">{part.item}</span><span className="shrink-0 tabular-nums text-[var(--color-muted-foreground)]">{part.hours}h</span></div>)}</div>}
              {suggested && <button type="button" onClick={() => setDraft(suggested)} className="mt-3 w-full rounded-lg border border-violet-200 px-2.5 py-2 text-[9px] font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/30">按单人 6h/工作日填入建议日期：{suggested}</button>}
            </div>
          )}
          {error && <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[10px] text-rose-500 dark:bg-rose-950/25">{error}</div>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function formatPersonDays(hours: number) {
  return Math.max(0, hours / 6).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

function suggestedCommitmentDate(hoursMax: number) {
  let remaining = Math.max(1, Math.ceil(hoursMax / 6))
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    const day = date.getDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

