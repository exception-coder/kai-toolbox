import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { listAssignableUsers, listItems, portfolioAnalyze, syncFromPrd } from '../api'
import type { ReqItemView } from '../types'
import { DeliveryStageDialog, DeliveryRegistrationDialog, getDeliveryOverview, type DeliveryRequirement, type DeliveryStageKey } from '@/features/delivery-center/public-api'
import { QuickRequirementDialog } from '../components/QuickRequirementDialog'
import { ReqpoolVibeDialog } from '../components/ReqpoolVibeDialog'
import { getSelfRepo } from '@/features/claude-chat/public-api'
import { useChatRuntime } from '@/features/claude-chat/public-api/runtime'
import { listSessions as listPrdSessions, type PrdSessionView } from '@/features/prd-clarify/public-api'
import { useReqpoolActions } from '../hooks/useReqpoolActions'
import { useReqpoolDocumentWorkflow } from '../hooks/useReqpoolDocumentWorkflow'
import { useReqpoolItemCommands } from '../hooks/useReqpoolItemCommands'
import { buildReqpoolVibeSeed, deliveryFor, prdSessionPollingInterval } from '../lib/reqpoolPageModel'
import { AssigneeCell, DeadlineEditor, MarkdownDocumentModal, PrdQuestionsModal, RequirementDrawer } from '../components/ReqPoolSections'
import { UnifiedDeliveryHeader } from '../components/UnifiedDeliveryHeader'
import { UnifiedDeliveryWorkspace } from '../components/UnifiedDeliveryWorkspace'

type ReqpoolVibeEngine = 'codex' | 'claude'

export function ReqPoolPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { chat, activate, setFloating, setMinimized } = useChatRuntime()
  const [registration, setRegistration] = useState<'standard' | 'feishu' | null>(null)
  const [inspection, setInspection] = useState<{ requirement: DeliveryRequirement; stage: DeliveryStageKey } | null>(null)
  const [visibleIds, setVisibleIds] = useState<string[]>([])
  const [selected, setSelected] = useState<ReqItemView | null>(null)
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
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
    refetchInterval: query => query.state.data?.requirements.some(item => item.verification?.status === 'RUNNING') ? 2_000 : false,
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

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const overview = overviewQuery.data
  const prdSessionById = useMemo(() => new Map((prdSessionsQuery.data ?? []).map(session => [session.id, session])), [prdSessionsQuery.data])
  const {
    startPrdClarification,
    submitPrdAnswers,
    startTddWork,
    startTddGeneration,
  } = useReqpoolDocumentWorkflow({ queryClient, sessionsById: prdSessionById, actions: reqpoolActions })
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
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

  return (
    <div className="unified-delivery mx-auto min-h-full max-w-[1800px] bg-background p-4 text-foreground md:p-6">
      <UnifiedDeliveryHeader refreshing={itemsQuery.isFetching || overviewQuery.isFetching} onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: ['reqpool'] }); void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] }); void queryClient.invalidateQueries({ queryKey: ['prd-sessions'] })
      }} onQuick={() => setQuickEntryOpen(true)} onStandard={() => setRegistration('standard')} onFeishu={() => setRegistration('feishu')}
        onPrioritize={() => portfolioMutation.mutate()} prioritizing={portfolioMutation.isPending} onVibe={() => openVibe()} />
      <div className="space-y-2 pb-3 text-xs" aria-live="polite">
        {itemsQuery.isLoading && <p>正在读取需求…</p>}
        {overviewQuery.isLoading && <p>正在读取交付证据…</p>}
        {itemsQuery.isError && <p role="alert">需求列表读取失败，以下仅展示可用交付证据。<button className="delivery-action ml-3" onClick={() => itemsQuery.refetch()}>重试需求</button></p>}
        {overviewQuery.isError && <p role="alert">交付证据读取失败，已登记需求仍可管理。<button className="delivery-action ml-3" onClick={() => overviewQuery.refetch()}>重试证据</button></p>}
        {prdSessionsQuery.isError && <p role="alert">规格会话读取失败。<button className="delivery-action ml-3" onClick={() => prdSessionsQuery.refetch()}>重试会话</button></p>}
        {(syncMutation.error || portfolioMutation.error) && <p role="alert">{(syncMutation.error ?? portfolioMutation.error)?.message}<button className="delivery-action ml-3" onClick={() => { syncMutation.reset(); portfolioMutation.reset() }}>关闭提示</button></p>}
        {overview?.warnings.map(warning => <p key={warning} className="text-muted-foreground">{warning}</p>)}
      </div>
      {selectedIds.size > 0 && <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <span>已选择 {selectedIds.size} 项已登记需求</span><button className="delivery-action" onClick={toggleVisible}>{allVisibleSelected ? '取消当前筛选选择' : '全选当前筛选'}</button>
        <button className="delivery-action" disabled={bulkDeleting} onClick={() => void removeSelected()}>批量删除</button><button className="delivery-action" onClick={() => setSelectedIds(new Set())}>取消选择</button>
        {bulkDeleteError && <span role="alert" className="text-destructive">{bulkDeleteError}</span>}
      </div>}
      <UnifiedDeliveryWorkspace items={items} overview={overview} loading={itemsQuery.isLoading || overviewQuery.isLoading} registrationsAvailable={itemsQuery.isSuccess} selectedIds={selectedIds} onToggle={toggleSelected} onVisibleChange={setVisibleIds}
        onOpenItem={setSelected} onRegister={() => setQuickEntryOpen(true)} onSync={() => syncMutation.mutate()} syncing={syncMutation.isPending}
        onStage={(requirement, stage) => {
          if (stage === 'code' && requirement.links.development) navigate(requirement.links.development)
          else setInspection({ requirement, stage })
        }}
        renderMetadata={item => <>
          <div><p className="mb-2 text-[10px] text-muted-foreground">负责人</p><AssigneeCell item={item} users={usersQuery.data ?? []} loading={usersQuery.isLoading} unavailable={usersQuery.isError} saving={assigningId === item.id} onAssign={userId => handleAssign(item.id, userId)} /></div>
          <div><p className="mb-2 text-[10px] text-muted-foreground">计划期限</p><DeadlineEditor item={item} prdSession={item.prdSessionId ? prdSessionById.get(item.prdSessionId) : undefined} saving={deadlineSavingId === item.id} onSave={deadline => handleDeadline(item.id, deadline)} /></div>
        </>} />
      {registration && <DeliveryRegistrationDialog mode={registration} onClose={() => setRegistration(null)} />}
      {inspection && <DeliveryStageDialog requirement={inspection.requirement} stage={inspection.stage} onStartTddGeneration={startTddGeneration} onClose={() => { setInspection(null); void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] }); void queryClient.invalidateQueries({ queryKey: ['prd-sessions'] }) }} />}
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
