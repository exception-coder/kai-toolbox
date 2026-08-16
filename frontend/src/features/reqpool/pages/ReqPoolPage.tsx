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
import { evaluateRequirementFacts } from '../factQuality'
import {
  DeliveryStageDialog,
  GenerationSupplementDialog,
  getDeliveryOverview,
  type DeliveryOverview,
  type DeliveryRequirement,
} from '@/features/delivery-center/public-api'
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
  type AgentEngine,
  type PrdSessionView,
  type QaPair,
  StartDevelopmentDialog,
} from '@/features/prd-clarify/public-api'
import { useAuth } from '@/lib/auth'
import { useReqpoolActions } from '../hooks/useReqpoolActions'
import { useReqpoolDocumentWorkflow } from '../hooks/useReqpoolDocumentWorkflow'
import { useReqpoolItemCommands } from '../hooks/useReqpoolItemCommands'
import { ReqPoolPageHeader, type ReqPoolViewMode } from '../components/ReqPoolPageHeader'
import {
  STATUS_META,
  branchSome,
  buildReqpoolVibeSeed,
  buildRequirementHierarchy,
  decisionOf,
  deliveryFor,
  effectiveInsight,
  excerpt,
  loadReqpoolViewPreference,
  relativeTime,
  saveReqpoolViewPreference,
  type ReqpoolDecision,
  type ReqpoolDensity,
} from '../lib/reqpoolPageModel'
import {
  AiStudio,
  AssigneeCell,
  DeadlineEditor,
  DecisionBadge,
  DeliveryTrack,
  DocumentStatusLegend,
  FactQualityBadge,
  LeaderBrief,
  MarkdownDocumentModal,
  MobileRequirementCard,
  PrdQuestionsModal,
  RequirementDrawer,
  RequirementLineage,
  type RequirementLineageActions,
  type RequirementLineageRunState,
} from '../components/ReqPoolSections'

type ReqpoolVibeEngine = 'codex' | 'claude'

export function ReqPoolPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { chat, activate, setFloating, setMinimized } = useChatRuntime()
  const [view, setView] = useState<ReqPoolViewMode>('table')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ReqStatus | ''>('')
  const [decisionFilter, setDecisionFilter] = useState<ReqpoolDecision | ''>('')
  const [selected, setSelected] = useState<ReqItemView | null>(null)
  const [studioOpen, setStudioOpen] = useState(false)
  const [entryMenuOpen, setEntryMenuOpen] = useState(false)
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const [viewPreference] = useState(loadReqpoolViewPreference)
  const [fields, setFields] = useState(viewPreference.fields)
  const [density, setDensity] = useState<ReqpoolDensity>(viewPreference.density)
  const [vibeOpen, setVibeOpen] = useState(false)
  const [vibeInitialPrompt, setVibeInitialPrompt] = useState('')
  const reqpoolActions = useReqpoolActions()
  const {
    notice: entryNotice,
    setNotice: setEntryNotice,
    analyzingId,
    setAnalyzingId,
    assigningId,
    setAssigningId,
    deadlineSavingId,
    setDeadlineSavingId,
    clarifyingPrdIds,
    setClarifyingPrdIds,
    generatingPrdIds,
    setGeneratingPrdIds,
    buildingTddQuestionIds,
    setBuildingTddQuestionIds,
    generatingTddIds,
    setGeneratingTddIds,
    failedTddIds,
    setFailedTddIds,
    questionPrd,
    setQuestionPrd,
    previewPrd,
    setPreviewPrd,
    tddWork,
    setTddWork,
    previewTdd,
    setPreviewTdd,
    selectedIds,
    setSelectedIds,
    bulkDeleteError,
    setBulkDeleteError,
    bulkDeleting,
    setBulkDeleting,
  } = reqpoolActions
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
    saveReqpoolViewPreference(fields, density)
  }, [density, fields])

  const items = itemsQuery.data ?? []
  const overview = overviewQuery.data
  const prdSessionById = useMemo(() => new Map((prdSessionsQuery.data ?? []).map(session => [session.id, session])), [prdSessionsQuery.data])
  const {
    startPrdClarification,
    submitPrdAnswers,
    startTddQuestions,
    startTddGeneration,
  } = useReqpoolDocumentWorkflow({ queryClient, sessionsById: prdSessionById, actions: reqpoolActions })
  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const rankA = effectiveInsight(a)?.rank ?? 999
    const rankB = effectiveInsight(b)?.rank ?? 999
    return rankA - rankB || b.updatedAt - a.updatedAt
  }), [items])
  const hierarchy = useMemo(
    () => buildRequirementHierarchy(sortedItems, prdSessionById, overview),
    [overview, prdSessionById, sortedItems],
  )
  const rootItems = hierarchy.roots
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const matches = (item: ReqItemView) => {
      if (status && item.status !== status) return false
      if (decisionFilter && decisionOf(item) !== decisionFilter) return false
      if (!keyword) return true
      return [item.title, item.description, item.project, item.module, item.assignee, item.tags].some(value => value?.toLowerCase().includes(keyword))
    }
    return rootItems.filter(item => branchSome(item, hierarchy.childrenByItemId, matches))
  }, [decisionFilter, hierarchy.childrenByItemId, query, rootItems, status])

  const counts = useMemo(() => ({
    now: rootItems.filter(item => decisionOf(item) === 'NOW').length,
    clarify: rootItems.filter(item => decisionOf(item) === 'CLARIFY').length,
    delivery: rootItems.filter(item => item.status === 'IN_DEV' || item.status === 'PRD_READY').length,
    risk: rootItems.filter(item => !item.assignee || !item.deadline || (deliveryFor(item, overview)?.staleReasons.length ?? 0) > 0).length,
  }), [overview, rootItems])

  const enabled = (id: string) => fields.find(field => field.id === id)?.enabled ?? false
  const columns = fields.filter(field => field.enabled).length
  const visibleIds = useMemo(() => filteredItems.map(item => item.id), [filteredItems])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected
  const {
    analyze,
    clarify,
    openPrdQuestions,
    remove,
    toggleSelected,
    toggleVisible,
    removeSelected,
    quickSaved: handleQuickSaved,
    assign: handleAssign,
    saveDeadline: handleDeadline,
  } = useReqpoolItemCommands({
    items,
    selected,
    setSelected,
    visibleIds,
    allVisibleSelected,
    sessionsById: prdSessionById,
    actions: reqpoolActions,
    closeQuickEntry: () => setQuickEntryOpen(false),
  })

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

  const lineageActions: RequirementLineageActions = {
    onStartPrd: (item, engine) => startPrdClarification(item, engine),
    onAnswerPrd: item => { void openPrdQuestions(item) },
    onPreviewPrd: item => setPreviewPrd(item),
    onStartTdd: (item, engine) => { if (item.prdSessionId) startTddQuestions(item.prdSessionId, engine) },
    onAnswerTdd: (_item, requirement) => setTddWork(requirement),
    onPreviewTdd: item => setPreviewTdd(item),
  }
  const lineageRunState: RequirementLineageRunState = {
    clarifyingPrdIds,
    generatingPrdIds,
    buildingTddQuestionIds,
    generatingTddIds,
    failedTddIds,
  }

  return (
    <div className="min-h-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      <ReqPoolPageHeader
        view={view}
        entryMenuOpen={entryMenuOpen}
        syncing={syncMutation.isPending}
        onViewChange={setView}
        onSync={() => syncMutation.mutate()}
        onEntryMenuChange={setEntryMenuOpen}
        onQuickEntry={() => { setEntryMenuOpen(false); setQuickEntryOpen(true) }}
        onStandardEntry={() => { setEntryMenuOpen(false); navigate('/tools/prd-clarify') }}
        onOpenVibe={openVibe}
      />

      {view === 'leader' ? <LeaderBrief items={rootItems} overview={overview} /> : (
        <main className="px-5 pb-10 pt-4 lg:px-8">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [Target, '建议本期投入', counts.now, 'AI 统一价值判定', 'text-emerald-600', 'bg-emerald-50 dark:bg-emerald-950/30'],
              [Lightbulb, '待补充信息', counts.clarify, '缺少目标或口径', 'text-amber-600', 'bg-amber-50 dark:bg-amber-950/30'],
              [Workflow, '正在交付', counts.delivery, '需求规格 / 执行方案 / 代码同步', 'text-violet-600', 'bg-violet-50 dark:bg-violet-950/30'],
              [ShieldAlert, '高风险事项', counts.risk, '需要负责人介入', 'text-rose-600', 'bg-rose-50 dark:bg-rose-950/30'],
            ].map(([Icon, label, value, hint, color, bg]) => { const MetricIcon = Icon as typeof Target; return <div key={String(label)} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"><span className={`grid h-9 w-9 place-items-center rounded-lg ${bg}`}><MetricIcon className={`h-4 w-4 ${color}`} /></span><div><div className="flex items-baseline gap-1.5"><span className="text-xl font-semibold tabular-nums">{String(value)}</span><span className="text-xs text-[var(--color-muted-foreground)]">{String(label)}</span></div><div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">{String(hint)}</div></div></div> })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1 lg:max-w-xs"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索需求、系统、负责人…" className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] pl-9 pr-3 text-xs outline-none focus:border-violet-400" /></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative"><Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" /><select value={decisionFilter} onChange={event => setDecisionFilter(event.target.value as ReqpoolDecision | '')} className="h-9 appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] pl-8 pr-8 text-xs outline-none"><option value="">全部判定</option><option value="NOW">建议投入</option><option value="CLARIFY">补充信息</option><option value="PLAN">进入排期</option><option value="PARK">暂不投入</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" /></label>
                <label className="relative"><select value={status} onChange={event => setStatus(event.target.value as ReqStatus | '')} className="h-9 appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] pl-3 pr-8 text-xs outline-none"><option value="">全部阶段</option>{Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" /></label>
                {(decisionFilter || status || query) && <button onClick={() => { setDecisionFilter(''); setStatus(''); setQuery('') }} className="h-9 px-2 text-[10px] text-violet-600">清除筛选</button>}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <DocumentStatusLegend />
                <button onClick={() => portfolioMutation.mutate()} disabled={portfolioMutation.isPending || rootItems.length === 0} className="flex h-9 items-center gap-1.5 rounded-lg border border-violet-200 px-3 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/30">{portfolioMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}重算优先级</button>
                <button onClick={() => setStudioOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]" title="字段与视图"><Settings2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            {selectedIds.size > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-violet-200 bg-violet-50/70 px-4 py-2.5 dark:border-violet-900 dark:bg-violet-950/20"><span className="text-xs font-semibold text-violet-700 dark:text-violet-300">已选择 {selectedIds.size} 条需求</span><span className="text-[10px] text-[var(--color-muted-foreground)]">可跨筛选条件保留选择</span><div className="ml-auto flex items-center gap-2"><button type="button" disabled={bulkDeleting} onClick={() => setSelectedIds(new Set())} className="rounded-lg px-2.5 py-1.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/70 disabled:opacity-40 dark:hover:bg-black/15">取消选择</button><button type="button" disabled={bulkDeleting} onClick={() => void removeSelected()} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">{bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}批量删除</button></div></div>}
            {bulkDeleteError && <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[10px] text-rose-600 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-300">{bulkDeleteError}</div>}

            {(itemsQuery.isLoading || prdSessionsQuery.isLoading) ? <div className="grid min-h-72 place-items-center"><div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />正在汇总需求与交付证据…</div></div> : filteredItems.length === 0 ? (
              <div className="grid min-h-72 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950/40"><TableProperties className="h-5 w-5" /></span><h3 className="mt-4 text-sm font-semibold">{rootItems.length === 0 ? '建立第一份统一需求台账' : '没有符合条件的需求'}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[var(--color-muted-foreground)]">{rootItems.length === 0 ? '可以登记真实需求，或载入演示数据体验统一判定、证据同步和领导汇报。' : '尝试清除筛选，或让 AI 为你创建新的展示视图。'}</p>{rootItems.length === 0 && <div className="mt-4 flex justify-center gap-2"><button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-muted)]">载入演示数据</button><button onClick={() => setQuickEntryOpen(true)} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white">快速登记需求</button></div>}</div></div>
            ) : (
              <div className="overflow-x-auto">
                <div className="divide-y divide-[var(--color-border)] md:hidden">
                  {filteredItems.map(item => {
                    const requirement = deliveryFor(item, overview)
                    const session = item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined
                    return <div key={item.id}><MobileRequirementCard item={item} requirement={requirement} prdSession={session} selected={selectedIds.has(item.id)} prdRunning={!!item.prdSessionId && (clarifyingPrdIds.has(item.prdSessionId) || generatingPrdIds.has(item.prdSessionId))} tddBuilding={!!item.prdSessionId && buildingTddQuestionIds.has(item.prdSessionId)} tddGenerating={!!item.prdSessionId && generatingTddIds.has(item.prdSessionId)} tddFailed={!!item.prdSessionId && failedTddIds.has(item.prdSessionId)} onToggle={() => toggleSelected(item.id)} onOpen={() => setSelected(item)} onDelete={() => void remove(item)} onStartPrd={engine => startPrdClarification(item, engine)} onAnswerPrd={() => void openPrdQuestions(item)} onPreviewPrd={() => setPreviewPrd(item)} onStartTdd={engine => item.prdSessionId && startTddQuestions(item.prdSessionId, engine)} onAnswerTdd={() => requirement && setTddWork(requirement)} onPreviewTdd={() => setPreviewTdd(item)} />{(hierarchy.childrenByItemId.get(item.id)?.length ?? 0) > 0 && <div className="px-4 pb-4"><RequirementLineage parent={item} childrenByItemId={hierarchy.childrenByItemId} sessionsById={prdSessionById} overview={overview} actions={lineageActions} runState={lineageRunState} /></div>}</div>
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
                    const insight = effectiveInsight(item)
                    const requirement = deliveryFor(item, overview)
                    const session = item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined
                    const missingOwner = !item.assignee
                    const factQuality = evaluateRequirementFacts(item, session)
                    const factRisk = factQuality.score < 75 && factQuality.deductions.length > 0
                      ? `事实质量 ${factQuality.score} 分：${factQuality.deductions[0].reason}`
                      : null
                    const risk = requirement?.staleReasons[0] || factRisk || (missingOwner ? '尚未明确唯一负责人' : item.status === 'DRAFT' ? '需补齐验收口径' : '暂无新增风险')
                    return <Fragment key={item.id}><tr onClick={() => setSelected(item)} className={`group cursor-pointer align-top transition-colors hover:bg-violet-50/35 dark:hover:bg-violet-950/10 ${selectedIds.has(item.id) ? 'bg-violet-50/65 dark:bg-violet-950/20' : ''} ${density === 'compact' ? '[&>td]:py-2.5' : '[&>td]:py-4'}`}>
                      <td className="px-3"><input type="checkbox" checked={selectedIds.has(item.id)} onClick={event => event.stopPropagation()} onChange={() => toggleSelected(item.id)} className="h-3.5 w-3.5 cursor-pointer rounded border-[var(--color-border)] accent-violet-600" aria-label={`选择需求：${item.title}`} /></td>
                      {enabled('decision') && <td className="px-4"><DecisionBadge decision={decisionOf(item)} /></td>}
                      {enabled('requirement') && <td className="px-4"><div className="flex items-start gap-2.5"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"><FileText className="h-3.5 w-3.5" /></span><div className="min-w-0"><div className="line-clamp-2 text-xs font-semibold leading-5">{item.title}</div><div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span><FactQualityBadge item={item} session={session} /><span className="max-w-[140px] truncate text-[10px] text-[var(--color-muted-foreground)]">{item.project || '待归属'} · {item.module || '待归类'}</span></div></div></div></td>}
                      {enabled('value') && <td className="px-4"><p className="line-clamp-2 text-xs leading-5 text-[var(--color-foreground)]/85">{insight?.reason || excerpt(item.description)}</p><div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-muted-foreground)]"><TrendingUp className="h-3 w-3 text-violet-500" />ROI {insight?.roi === 'HIGH' ? '高' : insight?.roi === 'LOW' ? '低' : '待验证'}{insight?.estimatedHours ? ` · ${insight.estimatedHours}h` : ''}</div></td>}
                      {enabled('owner') && <td className="px-4"><AssigneeCell item={item} users={usersQuery.data ?? []} loading={usersQuery.isLoading} unavailable={usersQuery.isError} saving={assigningId === item.id} onAssign={userId => handleAssign(item.id, userId)} /><DeadlineEditor item={item} prdSession={session} saving={deadlineSavingId === item.id} onSave={deadline => handleDeadline(item.id, deadline)} /></td>}
                      {enabled('delivery') && <td className="px-4"><DeliveryTrack item={item} requirement={requirement} prdSession={item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined} prdRunning={!!item.prdSessionId && (clarifyingPrdIds.has(item.prdSessionId) || generatingPrdIds.has(item.prdSessionId))} tddBuilding={!!item.prdSessionId && buildingTddQuestionIds.has(item.prdSessionId)} tddGenerating={!!item.prdSessionId && generatingTddIds.has(item.prdSessionId)} tddFailed={!!item.prdSessionId && failedTddIds.has(item.prdSessionId)} onStartPrd={engine => startPrdClarification(item, engine)} onAnswerPrd={() => void openPrdQuestions(item)} onPreviewPrd={() => setPreviewPrd(item)} onStartTdd={engine => item.prdSessionId && startTddQuestions(item.prdSessionId, engine)} onAnswerTdd={() => requirement && setTddWork(requirement)} onPreviewTdd={() => setPreviewTdd(item)} /></td>}
                      {enabled('risk') && <td className="px-4"><div className={`flex items-start gap-1.5 text-[11px] leading-5 ${risk.includes('暂无') ? 'text-[var(--color-muted-foreground)]' : 'text-amber-700 dark:text-amber-300'}`}>{risk.includes('暂无') ? <CircleCheck className="mt-1 h-3 w-3 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-1 h-3 w-3 shrink-0" />}<span className="line-clamp-2">{risk}</span></div><div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]"><Clock3 className="h-3 w-3" />{relativeTime(item.updatedAt)}自动更新</div></td>}
                      <td className="px-2"><div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"><button onClick={event => { event.stopPropagation(); void remove(item) }} className="rounded-lg p-2 text-[var(--color-muted-foreground)] hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30" title="删除当前需求" aria-label={`删除需求：${item.title}`}><Trash2 className="h-3.5 w-3.5" /></button><button onClick={event => { event.stopPropagation(); setSelected(item) }} className="rounded-lg p-2 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]" title="查看需求详情" aria-label={`查看需求：${item.title}`}><ChevronRight className="h-4 w-4" /></button></div></td>
                    </tr>{(hierarchy.childrenByItemId.get(item.id)?.length ?? 0) > 0 && <tr className="bg-[var(--color-muted)]/10"><td colSpan={columns + 2} className="px-4 pb-3 pt-0"><div className="ml-10"><RequirementLineage parent={item} childrenByItemId={hierarchy.childrenByItemId} sessionsById={prdSessionById} overview={overview} actions={lineageActions} runState={lineageRunState} /></div></td></tr>}</Fragment>
                  })}</tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3 text-[10px] text-[var(--color-muted-foreground)]"><span>共 {filteredItems.length} / {rootItems.length} 项根需求 · {items.length - rootItems.length} 个子节点已归入关系树 · 当前展示 {columns} 个标准字段组</span><div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><Radio className="h-3 w-3 text-emerald-500" />证据自动同步</span><button onClick={() => setStudioOpen(true)} className="flex items-center gap-1 text-violet-600"><PanelRightOpen className="h-3 w-3" />配置视图</button></div></div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[var(--color-muted-foreground)]"><span>判定模型：战略匹配 30% · 用户影响 25% · 可量化收益 25% · 成本与风险 20%</span><span>最后证据同步：{overview?.generatedAt ? relativeTime(overview.generatedAt) : '等待数据源'}</span></div>
        </main>
      )}

      {studioOpen && <AiStudio fields={fields} density={density} onFieldsChange={setFields} onDensityChange={setDensity} onClose={() => setStudioOpen(false)} />}
      {selected && <RequirementDrawer item={selected} requirement={deliveryFor(selected, overview)} prdSession={selected.prdSessionId ? prdSessionById.get(selected.prdSessionId) : undefined} analyzing={analyzingId === selected.id} prdRunning={!!selected.prdSessionId && (clarifyingPrdIds.has(selected.prdSessionId) || generatingPrdIds.has(selected.prdSessionId))} tddBuilding={!!selected.prdSessionId && buildingTddQuestionIds.has(selected.prdSessionId)} tddGenerating={!!selected.prdSessionId && generatingTddIds.has(selected.prdSessionId)} tddFailed={!!selected.prdSessionId && failedTddIds.has(selected.prdSessionId)} onClose={() => setSelected(null)} onAnalyze={() => analyze(selected)} onClarify={() => clarify(selected)} onStartPrd={engine => startPrdClarification(selected, engine)} onAnswerPrd={() => void openPrdQuestions(selected)} onPreviewPrd={() => setPreviewPrd(selected)} onStartTdd={engine => { const id = selected.prdSessionId; if (id) { setSelected(null); startTddQuestions(id, engine) } }} onAnswerTdd={() => { const requirement = deliveryFor(selected, overview); if (requirement) { setSelected(null); setTddWork(requirement) } }} onPreviewTdd={() => { setSelected(null); setPreviewTdd(selected) }} onViewPrd={() => selected.prdSessionId && navigate(`/tools/prd-clarify?viewSession=${selected.prdSessionId}`)} onDelete={() => remove(selected)} />}
      {quickEntryOpen && <QuickRequirementDialog onClose={() => setQuickEntryOpen(false)} onSaved={handleQuickSaved} />}
      {vibeOpen && <ReqpoolVibeDialog initialPrompt={vibeInitialPrompt} repoAvailable={selfRepoQuery.data?.exists === true} activating={!chat && pendingVibeRef.current != null} onClose={() => setVibeOpen(false)} onSubmit={startVibe} />}
      {questionPrd && <PrdQuestionsModal item={questionPrd.item} session={questionPrd.session} onClose={() => setQuestionPrd(null)} onSubmit={(history, extraInstructions) => submitPrdAnswers(questionPrd.item, questionPrd.session, history, extraInstructions)} />}
      {previewPrd && <MarkdownDocumentModal item={previewPrd} kind="PRD" onClose={() => setPreviewPrd(null)} onOpenFull={() => { const id = previewPrd.prdSessionId; setPreviewPrd(null); if (id) navigate(`/tools/prd-clarify?viewSession=${encodeURIComponent(id)}`) }} />}
      {tddWork && <DeliveryStageDialog requirement={tddWork} stage="tddClarify" onStartTddGeneration={startTddGeneration} onClose={() => { setTddWork(null); void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] }); void queryClient.invalidateQueries({ queryKey: ['prd-sessions', 'reqpool'] }) }} />}
      {previewTdd && <MarkdownDocumentModal item={previewTdd} kind="TDD" onClose={() => setPreviewTdd(null)} />}
      {entryNotice && <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-xs text-white shadow-xl"><CircleCheck className="h-4 w-4 text-emerald-400" />{entryNotice}</div>}
    </div>
  )
}
