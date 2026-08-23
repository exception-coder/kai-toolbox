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


function isTestProgressItem(item: ProgressItem) {
  return item.testItem === true || item.unitTest === true || /测试|\btests?\b/i.test(item.title)
}

/** 优先采用服务端双口径分数，旧响应则根据同一份进度项确定性回退计算。 */
function resolveCodeScore(requirement: DeliveryRequirement, includeTests: boolean) {
  const variants = requirement.codeScoreVariants
  const variantScore = includeTests
    ? variants?.includingTests ?? variants?.includingUnitTests
    : variants?.excludingTests ?? variants?.excludingUnitTests
  if (variantScore != null) return variantScore
  if (includeTests) return requirement.stages.code.score

  const { completed, partial, missing } = requirement.progressItems
  const testItemCount = [...completed, ...partial, ...missing].filter(isTestProgressItem).length
  if (testItemCount === 0) return requirement.stages.code.score

  const scoredCompleted = completed.filter(item => !isTestProgressItem(item)).length
  const scoredPartial = partial.filter(item => !isTestProgressItem(item)).length
  const scoredMissing = missing.filter(item => !isTestProgressItem(item)).length
  const scoredTotal = scoredCompleted + scoredPartial + scoredMissing
  if (scoredTotal === 0) return 100
  return Math.round(((scoredCompleted + scoredPartial * 0.5) / scoredTotal) * 100)
}

export function CodeStageNode({ item, requirement, prdSession }: {
  item: ReqItemView
  requirement?: DeliveryRequirement
  prdSession?: PrdSessionView
}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [includeTests, setIncludeTests] = useState(true)
  const [error, setError] = useState('')
  const [loadingDevelopment, setLoadingDevelopment] = useState(false)
  const [developmentDocs, setDevelopmentDocs] = useState<{ prd: string; tdd?: string } | null>(null)
  const labels = documentLabels
  const code = requirement?.stages.code
  const selectedCodeScore = requirement ? resolveCodeScore(requirement, includeTests) : null
  const effort = projectEffort(requirement?.effortProgress, selectedCodeScore)
  const deliveryProgress = requirement ? requirementProgress(requirement, includeTests) : null
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
      setError(cause instanceof Error ? cause.message : `读取${labels.specification} / ${labels.plan}失败`)
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
    <>
      <button type="button" onClick={event => { event.stopPropagation(); setOpen(true) }} className={`flex flex-col items-center gap-1 rounded-md outline-none ${code?.score == null ? 'text-violet-600' : ''}`} title="查看或重新分析本地代码进度">
        {code?.score == null ? (
          <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-violet-500 bg-violet-50 dark:bg-violet-950/30"><Search className="h-2.5 w-2.5" /></span>
        ) : <StageDot state={state} />}
        <span className={`whitespace-nowrap text-[10px] font-medium ${code?.status === 'STALE' ? 'text-amber-600' : code?.score != null ? 'text-emerald-600' : 'text-violet-600'}`}>{code?.score == null ? '分析代码' : '代码'}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:p-4" onMouseDown={event => event.target === event.currentTarget && !running && setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="本地代码实现分析" className="flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:h-[min(88vh,860px)] sm:rounded-2xl" onClick={event => event.stopPropagation()}>
            <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/35"><Gauge className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">本地代码实现分析</div>
                    <span className="text-lg font-semibold tabular-nums">{selectedCodeScore == null ? '未分析' : `${selectedCodeScore}%`}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--color-muted-foreground)]">综合当前{labels.specification}、最新{labels.plan}与本地代码证据核对真实实现，并关联原 AI 总工时估算剩余工作量。</p>
                </div>
                <button type="button" disabled={running} onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40" aria-label="关闭代码实现分析"><X className="h-4 w-4" /></button>
              </div>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--color-background)]/25 p-4 sm:p-5">
            <div className="rounded-lg bg-[var(--color-muted)]/55 px-3 py-2.5">
              <div className="text-[9px] text-[var(--color-muted-foreground)]">最近分析时间</div>
              <div className="mt-1 text-[11px] font-medium tabular-nums">{code?.updatedAt ? formatLifecycleTime(code.updatedAt) : '尚未分析'}</div>
              {code?.status === 'STALE' && <div className="mt-1 text-[10px] text-amber-600">{labels.specification}/{labels.plan}已更新，本次结果已过期</div>}
            </div>
            {requirement && selectedCodeScore != null && (
              <CodeAssessmentDetails requirement={requirement} includeTests={includeTests} />
            )}
            {effort && (
              <div className="overflow-hidden rounded-xl border border-violet-200 bg-violet-50/45 dark:border-violet-900 dark:bg-violet-950/20">
                <div className="border-b border-violet-200/70 px-3 py-2.5 dark:border-violet-900/70">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300"><Gauge className="h-3.5 w-3.5" />当前进度 vs 原预估</span>
                    <span className="text-[9px] text-[var(--color-muted-foreground)]">{effort.hoursPerWorkday}h / AI工作日</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/80 px-2.5 py-2 dark:bg-black/15">
                      <div className="text-[8px] text-[var(--color-muted-foreground)]">当前交付进度</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{deliveryProgress ?? effort.deliveryProgress}%</div>
                    </div>
                    <div className="rounded-lg bg-white/80 px-2.5 py-2 dark:bg-black/15">
                      <div className="text-[8px] text-[var(--color-muted-foreground)]">代码实现进度</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{effort.codeProgress == null ? '待分析' : `${effort.codeProgress}%`}</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950">
                    <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${effort.codeProgress ?? 0}%` }} />
                  </div>
                </div>
                <div className="space-y-2 px-3 py-2.5 text-[9px]">
                  <div className="flex items-center justify-between gap-3"><span className="text-[var(--color-muted-foreground)]">原评估总工时</span><span className="font-medium tabular-nums">{formatEffortRange(effort.baselineHoursMin, effort.baselineHoursMax)}h · {formatEffortRange(effort.baselineWorkdaysMin, effort.baselineWorkdaysMax)}工作日</span></div>
                  {effort.remainingHoursMin != null && effort.remainingHoursMax != null && effort.remainingWorkdaysMin != null && effort.remainingWorkdaysMax != null ? (
                    <>
                      <div className="flex items-center justify-between gap-3"><span className="text-[var(--color-muted-foreground)]">按进度折算已完成</span><span className="tabular-nums">{formatEffortRange(effort.completedHoursMin, effort.completedHoursMax)}h</span></div>
                      <div className="rounded-lg bg-violet-600 px-2.5 py-2 text-white">
                        <div className="flex items-end justify-between gap-3"><span>预计剩余</span><span className="text-sm font-semibold tabular-nums">{formatEffortRange(effort.remainingWorkdaysMin, effort.remainingWorkdaysMax)} 工作日</span></div>
                        <div className="mt-0.5 text-right text-[8px] text-white/75">约 {formatEffortRange(effort.remainingHoursMin, effort.remainingHoursMax)} 小时</div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-violet-300 px-2.5 py-2 text-center text-violet-700 dark:border-violet-800 dark:text-violet-300">执行本地代码分析后生成剩余工时与工作日</div>
                  )}
                  {effort.baselineStale && <div className="rounded-lg bg-amber-50 px-2.5 py-2 leading-4 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">原工时基线已过期：{effort.baselineStaleReasons.join('；')}。建议先在“责任与时间”重新评估。</div>}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-violet-200/70 pt-2 text-[8px] text-[var(--color-muted-foreground)] dark:border-violet-900/70">
                    <span>工时基线：{formatCompactTime(effort.estimatedAt)}</span>
                    <span>代码分析：{effort.analyzedAt ? formatCompactTime(effort.analyzedAt) : '尚未分析'}</span>
                  </div>
                  <div className="leading-4 text-[var(--color-muted-foreground)]">剩余量按代码实现进度扣减；{labels.specification}/{labels.plan}只计入交付进度，不虚减编码工作量。</div>
                </div>
              </div>
            )}
            <p className="text-[10px] leading-4 text-[var(--color-muted-foreground)]">{code?.note || `完成${labels.specification}与${labels.plan}后即可核查本地实现。没有真实代码证据的功能不会计为完成。`}</p>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <div className="text-[9px] font-semibold text-[var(--color-card-foreground)]">测试计分口径</div>
                <div className="mt-0.5 text-[8px] text-[var(--color-muted-foreground)]">基于同一次扫描即时切换，不会重新分析</div>
              </div>
              <div className="flex shrink-0 rounded-md bg-[var(--color-muted)] p-0.5 text-[9px]">
                <button type="button" disabled={running} onClick={() => setIncludeTests(true)} className={`rounded px-2 py-1 ${includeTests ? 'bg-[var(--color-card)] font-medium shadow-sm' : 'text-[var(--color-muted-foreground)]'}`}>纳入</button>
                <button type="button" disabled={running} onClick={() => setIncludeTests(false)} className={`rounded px-2 py-1 ${!includeTests ? 'bg-[var(--color-card)] font-medium shadow-sm' : 'text-[var(--color-muted-foreground)]'}`}>不纳入</button>
              </div>
            </div>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
            <button type="button" disabled={!canAnalyze || running} onClick={analyze} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {running ? '正在检查本地代码…' : code?.updatedAt ? '重新分析本地代码' : '开始分析本地代码'}
            </button>
            {!canAnalyze && <p className="text-center text-[9px] text-[var(--color-muted-foreground)]">请先完成{labels.planDocument}</p>}
            <div className="border-t border-[var(--color-border)] pt-3">
              <button type="button" disabled={!canDevelop || loadingDevelopment} onClick={() => void openDevelopment()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
                {loadingDevelopment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                {prdSession?.devSessionId ? '继续 Vibe Coding 开发' : '发起 Vibe Coding 开发'}
              </button>
              {!user && <p className="mt-2 text-center text-[9px] text-amber-600">登录后可校验开发权限</p>}
              {user && !canDevelop && <p className="mt-2 text-center text-[9px] text-[var(--color-muted-foreground)]">仅管理员或当前需求负责人可操作</p>}
            </div>
            </div>
          </section>
        </div>
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
    </>
  )
}

function CodeAssessmentDetails({ requirement, includeTests }: {
  requirement: DeliveryRequirement
  includeTests: boolean
}) {
  const { progressItems, alignmentFindings } = requirement
  const scoredCompleted = includeTests ? progressItems.completed : progressItems.completed.filter(item => !isTestProgressItem(item))
  const scoredPartial = includeTests ? progressItems.partial : progressItems.partial.filter(item => !isTestProgressItem(item))
  const scoredMissing = includeTests ? progressItems.missing : progressItems.missing.filter(item => !isTestProgressItem(item))
  const excluded = includeTests
    ? progressItems.excluded ?? []
    : [
        ...progressItems.completed.filter(isTestProgressItem),
        ...progressItems.partial.filter(isTestProgressItem),
        ...progressItems.missing.filter(isTestProgressItem),
        ...(progressItems.excluded ?? []),
      ]
  const coverage = {
    completed: scoredCompleted.length,
    partial: scoredPartial.length,
    missing: scoredMissing.length,
    total: scoredCompleted.length + scoredPartial.length + scoredMissing.length,
  }
  const score = resolveCodeScore(requirement, includeTests) ?? 0
  const totalDeduction = Math.max(0, 100 - score)
  const deductions = [
    ...scoredMissing.map(item => ({ item, kind: '未完成', points: coverage.total > 0 ? 100 / coverage.total : 0 })),
    ...scoredPartial.map(item => ({ item, kind: '部分完成', points: coverage.total > 0 ? 50 / coverage.total : 0 })),
  ]
  const conclusion = assessmentConclusion(coverage, score, excluded.length)

  return (
    <section className="border-l-2 border-violet-500 pl-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold text-[var(--color-card-foreground)]">评估结论</div>
        <span className={`text-[9px] font-semibold ${totalDeduction > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {totalDeduction > 0 ? `共扣 ${totalDeduction} 分` : '无扣分'}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">{conclusion}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] tabular-nums">
        <span className="text-emerald-600">✓ 已完成 {coverage.completed}</span>
        <span className="text-amber-600">◐ 部分完成 {coverage.partial}</span>
        <span className="text-rose-600">× 未完成 {coverage.missing}</span>
        {excluded.length > 0 && <span className="text-sky-600">○ 不计分 {excluded.length}</span>}
      </div>
      <div className="mt-1 text-[8px] text-[var(--color-muted-foreground)]">
        全部测试：{includeTests ? '纳入实现度' : '不纳入实现度'} · 同一份代码扫描结果
      </div>

      {deductions.length > 0 && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-2.5">
          <div className="text-[9px] font-semibold text-[var(--color-card-foreground)]">扣分项明细</div>
          <div className="mt-1 divide-y divide-[var(--color-border)]">
            {deductions.map(({ item, kind, points }, index) => (
              <div key={`${kind}-${item.title}-${index}`} className="py-2 first:pt-1.5">
                <div className="flex items-start justify-between gap-3 text-[9px]">
                  <span className="min-w-0 font-medium text-[var(--color-card-foreground)]">{kind} · {item.title}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-rose-600">-{formatDeduction(points)} 分</span>
                </div>
                <p className="mt-1 text-[9px] leading-4 text-[var(--color-muted-foreground)]">
                  {deductionReason(item, kind)}
                </p>
                {item.evidence.length > 0 && (
                  <p className="mt-0.5 break-words text-[8px] leading-3 text-violet-600 dark:text-violet-300">证据：{item.evidence.join('；')}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[8px] leading-3 text-[var(--color-muted-foreground)]">
            评分口径：每个未完成功能点扣完整权重，部分完成功能点扣一半权重；单项分值按功能点总数折算，最终得分取整。
          </p>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-2.5">
          <div className="text-[9px] font-semibold text-sky-700 dark:text-sky-300">观察项（不计分）</div>
          <div className="mt-1 divide-y divide-[var(--color-border)]">
            {excluded.map((item, index) => (
              <div key={`${item.title}-${index}`} className="py-2 first:pt-1.5">
                <div className="flex items-start justify-between gap-3 text-[9px]">
                  <span className="font-medium text-[var(--color-card-foreground)]">{item.title}</span>
                  <span className="shrink-0 font-semibold text-sky-600">0 分</span>
                </div>
                <p className="mt-1 text-[9px] leading-4 text-[var(--color-muted-foreground)]">{item.actual || item.missing || item.implemented || '已核查，本次不纳入计分'}</p>
                {item.evidence.length > 0 && <p className="mt-0.5 break-words text-[8px] leading-3 text-violet-600 dark:text-violet-300">证据：{item.evidence.join('；')}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {alignmentFindings.length > 0 && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />需求规格 / 执行方案与代码差异 {alignmentFindings.length} 项
          </div>
          <div className="mt-1.5 space-y-2">
            {alignmentFindings.map((finding, index) => (
              <div key={`${finding.requirement}-${index}`} className="text-[9px] leading-4">
                <div className="font-medium text-[var(--color-card-foreground)]">{finding.requirement} · {finding.status}</div>
                <div className="text-[var(--color-muted-foreground)]">要求：{finding.expected || '未说明'}</div>
                <div className="text-[var(--color-muted-foreground)]">代码：{finding.actual || '未发现'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function assessmentConclusion(
  coverage: DeliveryRequirement['coverage'],
  score: number,
  excludedCount: number,
) {
  const excludedNote = excludedCount > 0 ? `；另有 ${excludedCount} 个测试观察项不计分` : ''
  if (coverage.total === 0) return '评估已完成，但报告中没有可解析的功能点明细，建议重新分析。'
  if (score === 100) return `已核对 ${coverage.total} 个计分功能点，均判定为已实现${excludedNote}；可继续结合测试与运行证据确认交付。`
  const gaps = [
    coverage.missing > 0 ? `${coverage.missing} 个未完成` : '',
    coverage.partial > 0 ? `${coverage.partial} 个部分完成` : '',
  ].filter(Boolean).join('、')
  return `已核对 ${coverage.total} 个计分功能点，代码实现度 ${score}%；其中 ${gaps}${excludedNote}，需要优先补齐对应实现与代码证据。`
}

function projectEffort(
  effort: DeliveryRequirement['effortProgress'],
  codeScore: number | null,
) {
  if (!effort || codeScore == null) return effort
  const completedRatio = codeScore / 100
  const remainingRatio = 1 - completedRatio
  const roundOne = (value: number) => Math.round(value * 10) / 10
  return {
    ...effort,
    codeProgress: codeScore,
    completedHoursMin: roundOne(effort.baselineHoursMin * completedRatio),
    completedHoursMax: roundOne(effort.baselineHoursMax * completedRatio),
    remainingHoursMin: roundOne(effort.baselineHoursMin * remainingRatio),
    remainingHoursMax: roundOne(effort.baselineHoursMax * remainingRatio),
    remainingWorkdaysMin: roundOne(effort.baselineHoursMin * remainingRatio / effort.hoursPerWorkday),
    remainingWorkdaysMax: roundOne(effort.baselineHoursMax * remainingRatio / effort.hoursPerWorkday),
  }
}

function deductionReason(item: DeliveryRequirement['progressItems']['missing'][number], kind: string) {
  if (kind === '部分完成') {
    const implemented = item.implemented ? `已实现：${item.implemented}` : ''
    const missing = item.missing ? `缺失：${item.missing}` : '仍有实现或证据缺口'
    return [implemented, missing].filter(Boolean).join('；')
  }
  return item.missing || item.actual || '未发现可验证的代码实现或证据'
}

function formatDeduction(points: number) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}

function formatEffortRange(min: number | null, max: number | null) {
  if (min == null || max == null) return '—'
  const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
  return min === max ? format(min) : `${format(min)}–${format(max)}`
}
