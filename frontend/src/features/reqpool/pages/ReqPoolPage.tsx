import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  CircleCheck,
  Filter,
  Gauge,
  Loader2,
  PanelRightOpen,
  Radio,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import {
  analyzeItem,
  assignItem,
  deleteItem,
  deleteItems,
  listAssignableUsers,
  listItems,
  portfolioAnalyze,
  startClarify,
  syncFromPrd,
  updateItem,
} from '../api'
import type { AssignableUser, ReqItemView, ReqStatus } from '../types'
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
import { getSelfRepo } from '@/features/claude-chat/public-api'
import { useChatRuntime } from '@/features/claude-chat/public-api/runtime'
import {
  getContent as getPrdContent,
  getDevDocContent,
  estimateDevDocEffort,
  evaluateProgress as runCodeProgressAnalysis,
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
  loadReqpoolViewPreference,
  prdSessionPollingInterval,
  relativeTime,
  saveReqpoolViewPreference,
  type ReqpoolDecision,
  type ReqpoolDensity,
} from '../lib/reqpoolPageModel'
import {
  AssigneeCell,
  AiStudio,
  DeadlineEditor,
  DeliveryTrack,
  DocumentStatusLegend,
  LeaderBrief,
  MarkdownDocumentModal,
  MobileRequirementCard,
  PrdQuestionsModal,
  RequirementDrawer,
  RequirementLineage,
  type RequirementLineageActions,
  type RequirementLineageRunState,
} from '../components/ReqPoolSections'
import { RequirementBoard } from '../components/RequirementBoard'

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

  const itemsQuery = useQuery({
    queryKey: ['reqpool'],
    queryFn: () => listItems(),
    refetchInterval: query => (query.state.data as ReqItemView[] | undefined)
      ?.some(item => item.insightRun?.status === 'RUNNING' || item.planningAssessment?.status === 'RUNNING') ? 2_500 : false,
  })
  const overviewQuery = useQuery({
    queryKey: ['delivery-overview', 'reqpool'],
    queryFn: () => getDeliveryOverview(),
    retry: false,
    staleTime: 30_000,
  })
  const prdSessionsQuery = useQuery({
    queryKey: ['prd-sessions', 'reqpool'],
    queryFn: listPrdSessions,
    retry: false,
    staleTime: 30_000,
    refetchInterval: query => prdSessionPollingInterval(query.state.data as PrdSessionView[] | undefined),
  })
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
  useEffect(() => {
    saveReqpoolViewPreference(fields, density)
  }, [density, fields])

  const items = itemsQuery.data ?? []
  const overview = overviewQuery.data
  const prdSessionById = useMemo(() => new Map((prdSessionsQuery.data ?? []).map(session => [session.id, session])), [prdSessionsQuery.data])
  const {
    startPrdClarification,
    submitPrdAnswers,
    startTddWork,
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
    if (!selected) return
    const current = items.find(item => item.id === selected.id)
    if (current && current !== selected) setSelected(current)
  }, [items, selected])

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
    onStartTdd: (item, engine) => { if (item.prdSessionId) startTddWork(item.prdSessionId, engine) },
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
          <section className="mb-4 grid grid-cols-2 border-y border-[var(--color-border)] bg-[var(--color-card)] sm:grid-cols-4" aria-label="需求组合概览">
            {[
              ['建议投入', counts.now, 'AI 统一判定'],
              ['待补充', counts.clarify, '缺少关键信息'],
              ['正在交付', counts.delivery, '规格与执行同步'],
              ['高风险', counts.risk, '需要负责人介入'],
            ].map(([label, value, hint], index) => <div key={String(label)} className={`px-4 py-4 ${index > 0 ? 'border-l border-[var(--color-border)]' : ''} ${index === 2 ? 'max-sm:border-l-0 max-sm:border-t' : ''} ${index === 3 ? 'max-sm:border-t' : ''}`}><div className="text-[10px] font-medium text-[var(--color-muted-foreground)]">{String(label)}</div><div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{String(value)}</div><div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{String(hint)}</div></div>)}
          </section>

          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1 lg:max-w-xs"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索需求、系统、负责人…" className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] pl-9 pr-3 text-xs outline-none focus:border-violet-400" /></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative"><Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" /><select value={decisionFilter} onChange={event => setDecisionFilter(event.target.value as ReqpoolDecision | '')} className="h-9 appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] pl-8 pr-8 text-xs outline-none"><option value="">全部判定</option><option value="NOW">建议投入</option><option value="CLARIFY">补充信息</option><option value="PLAN">进入排期</option><option value="PARK">暂不投入</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" /></label>
                <label className="relative"><select value={status} onChange={event => setStatus(event.target.value as ReqStatus | '')} className="h-9 appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] pl-3 pr-8 text-xs outline-none"><option value="">全部阶段</option>{Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-muted-foreground)]" /></label>
                {(decisionFilter || status || query) && <button onClick={() => { setDecisionFilter(''); setStatus(''); setQuery('') }} className="h-9 px-2 text-[10px] text-violet-600">清除筛选</button>}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <DocumentStatusLegend />
                <button onClick={() => portfolioMutation.mutate()} disabled={portfolioMutation.isPending || rootItems.length === 0} className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium hover:bg-[var(--color-muted)] disabled:opacity-40">{portfolioMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5 text-[var(--color-primary)]" />}重算优先级</button>
                <button onClick={() => setStudioOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]" title="字段与视图"><Settings2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            {selectedIds.size > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-violet-200 bg-violet-50/70 px-4 py-2.5 dark:border-violet-900 dark:bg-violet-950/20"><span className="text-xs font-semibold text-violet-700 dark:text-violet-300">已选择 {selectedIds.size} 条需求</span><span className="text-[10px] text-[var(--color-muted-foreground)]">可跨筛选条件保留选择</span><div className="ml-auto flex items-center gap-2"><button type="button" disabled={bulkDeleting} onClick={() => setSelectedIds(new Set())} className="rounded-lg px-2.5 py-1.5 text-[10px] text-[var(--color-muted-foreground)] hover:bg-white/70 disabled:opacity-40 dark:hover:bg-black/15">取消选择</button><button type="button" disabled={bulkDeleting} onClick={() => void removeSelected()} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">{bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}批量删除</button></div></div>}
            {bulkDeleteError && <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[10px] text-rose-600 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-300">{bulkDeleteError}</div>}

            {itemsQuery.isLoading ? <div className="min-h-72 px-4 py-10" aria-live="polite"><div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />正在读取需求工作流…</div><div className="mt-6 grid grid-cols-3 gap-3 opacity-55"><div className="h-40 animate-pulse bg-[var(--color-muted)]" /><div className="h-52 animate-pulse bg-[var(--color-muted)]" /><div className="h-32 animate-pulse bg-[var(--color-muted)]" /></div></div> : filteredItems.length === 0 ? (
              <div className="min-h-72 px-5 py-12"><div className="max-w-md"><div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">当前工作流</div><h3 className="mt-3 text-lg font-semibold tracking-tight">{rootItems.length === 0 ? '还没有统一登记的需求' : '当前筛选没有结果'}</h3><p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">{rootItems.length === 0 ? '登记真实需求后，这里会按待受理、澄清、准入、交付到归档形成完整轨道。' : '需求仍在原阶段中，清除筛选即可恢复完整看板。'}</p><button onClick={() => rootItems.length === 0 ? setQuickEntryOpen(true) : (setDecisionFilter(''), setStatus(''), setQuery(''))} className="mt-5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-[var(--color-primary-foreground)]">{rootItems.length === 0 ? '登记第一条需求' : '清除筛选'}</button></div></div>
            ) : <RequirementBoard
              items={filteredItems}
              density={density}
              allSelected={allVisibleSelected}
              selectAllRef={selectAllRef}
              onToggleAll={toggleVisible}
              renderNote={item => {
                const requirement = deliveryFor(item, overview)
                const session = item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined
                return <MobileRequirementCard item={item} requirement={requirement} prdSession={session} selected={selectedIds.has(item.id)} prdRunning={!!item.prdSessionId && (clarifyingPrdIds.has(item.prdSessionId) || generatingPrdIds.has(item.prdSessionId))} tddBuilding={!!item.prdSessionId && buildingTddQuestionIds.has(item.prdSessionId)} tddGenerating={!!item.prdSessionId && generatingTddIds.has(item.prdSessionId)} tddFailed={!!item.prdSessionId && failedTddIds.has(item.prdSessionId)} onToggle={() => toggleSelected(item.id)} onOpen={() => setSelected(item)} onDelete={() => void remove(item)} onStartPrd={engine => startPrdClarification(item, engine)} onAnswerPrd={() => void openPrdQuestions(item)} onPreviewPrd={() => setPreviewPrd(item)} onStartTdd={engine => item.prdSessionId && startTddWork(item.prdSessionId, engine)} onAnswerTdd={() => requirement && setTddWork(requirement)} onPreviewTdd={() => setPreviewTdd(item)} showOwner={enabled('owner')} showDelivery={enabled('delivery')} showRisk={enabled('risk')} ownerControl={<AssigneeCell item={item} users={usersQuery.data ?? []} loading={usersQuery.isLoading} unavailable={usersQuery.isError} saving={assigningId === item.id} onAssign={userId => handleAssign(item.id, userId)} />} deadlineControl={<DeadlineEditor item={item} prdSession={session} saving={deadlineSavingId === item.id} onSave={deadline => handleDeadline(item.id, deadline)} />} />
              }}
              renderLineage={item => (hierarchy.childrenByItemId.get(item.id)?.length ?? 0) > 0 ? <div className="mt-2 border-l border-[var(--color-border)] pl-2"><RequirementLineage parent={item} childrenByItemId={hierarchy.childrenByItemId} sessionsById={prdSessionById} overview={overview} actions={lineageActions} runState={lineageRunState} /></div> : null}
            />}
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3 text-[10px] text-[var(--color-muted-foreground)]"><span>共 {filteredItems.length} / {rootItems.length} 项根需求 · {items.length - rootItems.length} 个子节点已归入关系树 · 当前展示 {columns} 个标准字段组</span><div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><Radio className="h-3 w-3" />证据自动同步</span><button onClick={() => setStudioOpen(true)} className="flex items-center gap-1 text-[var(--color-primary)]"><PanelRightOpen className="h-3 w-3" />配置视图</button></div></div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[var(--color-muted-foreground)]"><span>判定模型：战略匹配 30% · 用户影响 25% · 可量化收益 25% · 成本与风险 20%</span><span>最后证据同步：{overview?.generatedAt ? relativeTime(overview.generatedAt) : '等待数据源'}</span></div>
        </main>
      )}

      {studioOpen && <AiStudio fields={fields} density={density} onFieldsChange={setFields} onDensityChange={setDensity} onClose={() => setStudioOpen(false)} />}
      {selected && <RequirementDrawer item={selected} requirement={deliveryFor(selected, overview)} prdSession={selected.prdSessionId ? prdSessionById.get(selected.prdSessionId) : undefined} analyzing={analyzingId === selected.id || selected.insightRun?.status === 'RUNNING'} prdRunning={!!selected.prdSessionId && (clarifyingPrdIds.has(selected.prdSessionId) || generatingPrdIds.has(selected.prdSessionId))} tddBuilding={!!selected.prdSessionId && buildingTddQuestionIds.has(selected.prdSessionId)} tddGenerating={!!selected.prdSessionId && generatingTddIds.has(selected.prdSessionId)} tddFailed={!!selected.prdSessionId && failedTddIds.has(selected.prdSessionId)} onClose={() => setSelected(null)} onAnalyze={engine => analyze(selected, engine)} onClarify={() => clarify(selected)} onStartPrd={engine => startPrdClarification(selected, engine)} onAnswerPrd={() => void openPrdQuestions(selected)} onPreviewPrd={() => setPreviewPrd(selected)} onStartTdd={engine => { const id = selected.prdSessionId; if (id) { setSelected(null); startTddWork(id, engine) } }} onAnswerTdd={() => { const requirement = deliveryFor(selected, overview); if (requirement) { setSelected(null); setTddWork(requirement) } }} onPreviewTdd={() => { setSelected(null); setPreviewTdd(selected) }} onViewPrd={() => selected.prdSessionId && navigate(`/tools/prd-clarify?viewSession=${selected.prdSessionId}`)} onDelete={() => remove(selected)} />}
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
