import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { Bot, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  controlSessionAutopilot,
  checkAutopilotBinding,
  getSessionAutopilot,
  getAutopilotBatch,
  listAutopilotTasks,
  previewAutopilotBindings,
  recommendAutopilotBindings,
  startSessionAutopilot,
} from '../api'
import type { AutopilotBindingCandidate, SessionAutopilotRun } from '../types'
import { SupervisionSummary } from './SupervisionSummary'
import { ProjectExecutionControl } from './ProjectExecutionControl'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'

interface SessionAutopilotStatusProps {
  sessionId: string
  projectRoot: string
  onOpenDashboard: () => void
  agentRunning?: boolean
  onSupplementSpec?: (changeId: string | null) => void
}

const stateLabel: Record<SessionAutopilotRun['state'], string> = {
  ACTIVE: '监督中',
  PAUSED: '已暂停',
  WAITING_USER: '待处理',
  FAILED: '失败',
  COMPLETED: '已完成',
  STOPPED: '已停止',
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

/** 当前会话的 OpenSpec 绑定、双层兜底与恢复操作。 */
export function SessionAutopilotStatus({ sessionId, projectRoot, onOpenDashboard, agentRunning = false, onSupplementSpec }: SessionAutopilotStatusProps) {
  const queryClient = useQueryClient()
  const portalContainer = useFullscreenPortalContainer()
  const [expanded, setExpanded] = useState(false)
  const [budgetNow, setBudgetNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setBudgetNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [changeId, setChangeId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionTouched, setSelectionTouched] = useState(false)
  const [goal, setGoal] = useState('')
  const [autoArchive, setAutoArchive] = useState(true)
  const [supplementing, setSupplementing] = useState<string | null | undefined>(undefined)
  const [sawSupplementTurn, setSawSupplementTurn] = useState(false)
  const [waitingForQueuedTurn, setWaitingForQueuedTurn] = useState(false)
  const [resumeAfterSupplement, setResumeAfterSupplement] = useState(false)
  const runQuery = useQuery({
    queryKey: ['claude-chat-autopilot', sessionId],
    queryFn: () => getSessionAutopilot(sessionId),
    staleTime: 4_000,
    refetchInterval: 15_000,
  })
  const candidatesQuery = useQuery({
    queryKey: ['claude-chat-autopilot-candidates', sessionId, projectRoot],
    queryFn: () => previewAutopilotBindings(sessionId, projectRoot),
    enabled: pickerOpen && !runQuery.data && supplementing === undefined,
    staleTime: 0,
  })
  const aiQuery = useQuery({
    queryKey: ['claude-chat-autopilot-ai-recommendations', sessionId, projectRoot],
    queryFn: () => recommendAutopilotBindings(sessionId, projectRoot),
    enabled: pickerOpen && !runQuery.data && supplementing === undefined,
    staleTime: 60_000,
    retry: false,
  })
  const candidates = useMemo(() => {
    const order = aiQuery.data ?? []
    return [...(candidatesQuery.data ?? [])].sort((left, right) => {
      const leftRank = order.indexOf(left.changeId)
      const rightRank = order.indexOf(right.changeId)
      if (leftRank >= 0 || rightRank >= 0) return (leftRank < 0 ? 100 : leftRank) - (rightRank < 0 ? 100 : rightRank)
      return right.relevance - left.relevance
    }).slice(0, 10)
  }, [candidatesQuery.data, aiQuery.data])
  const batchQuery = useQuery({
    queryKey: ['claude-chat-autopilot-batch', sessionId],
    queryFn: () => getAutopilotBatch(sessionId),
    enabled: Boolean(runQuery.data),
    staleTime: 4_000,
    refetchInterval: 15_000,
  })
  const selected = candidatesQuery.data?.find(candidate => candidate.changeId === changeId)
  const batchProgress = useQueries({ queries: (batchQuery.data?.changeIds ?? []).map(id => ({
    queryKey: ['claude-chat-autopilot-tasks', sessionId, id],
    queryFn: () => listAutopilotTasks(sessionId, id),
    enabled: expanded,
    staleTime: 30_000,
    refetchInterval: expanded ? 30_000 : false,
  })) })
  const selectedChecks = useQueries({ queries: selectedIds.map(id => ({
    queryKey: ['claude-chat-autopilot-check', sessionId, projectRoot, id],
    queryFn: () => checkAutopilotBinding(sessionId, id, projectRoot),
    enabled: pickerOpen,
    staleTime: 0,
  })) })
  const allReady = selectedIds.length > 0 && selectedChecks.length === selectedIds.length
    && selectedChecks.every(query => !query.isFetching && query.data?.ready && query.data.revision)
  const expectedRevisions = Object.fromEntries(selectedChecks.flatMap((query, index) =>
    query.data?.revision ? [[selectedIds[index], query.data.revision]] : []))
  const checkQuery = useQuery({
    queryKey: ['claude-chat-autopilot-check', sessionId, projectRoot, changeId],
    queryFn: () => checkAutopilotBinding(sessionId, changeId, projectRoot),
    enabled: pickerOpen && Boolean(changeId),
    staleTime: 0,
  })
  useEffect(() => {
    const onState = (event: Event) => {
      const next = (event as CustomEvent<SessionAutopilotRun>).detail
      if (next?.sessionId === sessionId) {
        queryClient.setQueryData(['claude-chat-autopilot', sessionId], next)
        void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-batch', sessionId] })
      }
    }
    window.addEventListener('claude-chat:autopilot-state', onState)
    return () => window.removeEventListener('claude-chat:autopilot-state', onState)
  }, [queryClient, sessionId])
  useEffect(() => {
    const onRequest = (event: Event) => {
      if ((event as CustomEvent<string>).detail === sessionId) {
        setChangeId('')
        setSelectedIds([])
        setSelectionTouched(false)
        setPickerOpen(true)
      }
    }
    window.addEventListener('claude-chat:autopilot-bind-request', onRequest)
    return () => window.removeEventListener('claude-chat:autopilot-bind-request', onRequest)
  }, [sessionId])
  useEffect(() => {
    const candidate = candidates[0]
    if (candidate && (!changeId || (!selectionTouched && aiQuery.data?.length && candidate.changeId !== changeId))) {
      setChangeId(candidate.changeId)
      setSelectedIds([candidate.changeId])
      setGoal(`完成 OpenSpec change ${candidate.changeId}`)
    }
  }, [changeId, candidates, selectionTouched, aiQuery.data])
  useEffect(() => {
    if (supplementing === undefined) return
    if (waitingForQueuedTurn) {
      if (!agentRunning) setWaitingForQueuedTurn(false)
      return
    }
    if (agentRunning) setSawSupplementTurn(true)
    else if (sawSupplementTurn) {
      setChangeId(supplementing ?? '')
      setSelectedIds(supplementing ? [supplementing] : [])
      setPickerOpen(true)
      setResumeAfterSupplement(true)
      setSupplementing(undefined)
      setSawSupplementTurn(false)
      void candidatesQuery.refetch()
    }
  }, [agentRunning, sawSupplementTurn, supplementing, waitingForQueuedTurn, candidatesQuery])

  const requestSupplement = (target: string | null) => {
    if (target) queryClient.removeQueries({ queryKey: ['claude-chat-autopilot-check', sessionId, projectRoot, target] })
    setSupplementing(target)
    setSawSupplementTurn(false)
    setWaitingForQueuedTurn(agentRunning)
    onSupplementSpec?.(target)
    setPickerOpen(false)
  }

  const refresh = (run: SessionAutopilotRun) => {
    queryClient.setQueryData(['claude-chat-autopilot', sessionId], run)
    void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-runs'] })
  }
  const start = useMutation({
    mutationFn: () => startSessionAutopilot(sessionId, { projectRoot, changeId, goal, autoArchive,
      expectedRevision: checkQuery.data?.revision ?? '', changeIds: selectedIds,
      expectedRevisions }),
    onSuccess: run => { refresh(run); void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-batch', sessionId] }); setPickerOpen(false); setExpanded(true) },
  })
  useEffect(() => {
    if (!resumeAfterSupplement || !pickerOpen || start.isPending || checkQuery.isFetching || !checkQuery.data?.ready || !goal.trim() || selectedIds.length !== 1) return
    if (candidatesQuery.data?.length !== 1 && !changeId) return
    if (checkQuery.data.changeId !== changeId || !checkQuery.data.revision) return
    setResumeAfterSupplement(false)
    start.mutate()
  }, [resumeAfterSupplement, pickerOpen, start, checkQuery.data, goal, candidatesQuery.data, changeId, selectedIds])
  const control = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'stop') => {
      if (!runQuery.data) throw new Error('自动监督状态尚未加载')
      return controlSessionAutopilot(sessionId, action, runQuery.data.version)
    },
    onSuccess: refresh,
  })
  const run = runQuery.data
  const error = control.error ?? runQuery.error

  return (
    <section className="border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_42%,transparent)]" aria-label="OpenSpec 自动监督">
      <div className="flex min-h-9 items-center gap-2 px-3 text-xs">
        <Bot className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden="true" />
        {run ? (
          <>
            <button type="button" className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
              <span className={cn('font-medium', run.state === 'ACTIVE' ? 'text-emerald-700 dark:text-emerald-400' : run.state === 'WAITING_USER' || run.state === 'FAILED' ? 'text-amber-700 dark:text-amber-400' : '')}>
                {stateLabel[run.state]}
              </span>
              <span className="mx-1.5 text-[var(--color-border)]">/</span>
              <span className="font-medium">OpenSpec · {run.changeId}</span>
              {batchQuery.data && <span className="ml-1.5 text-[var(--color-muted-foreground)]">{batchQuery.data.currentIndex + 1}/{batchQuery.data.changeIds.length} 项</span>}
              <span className="ml-1.5 text-[var(--color-muted-foreground)]">
                {run.currentTaskId ? `task ${run.currentTaskId}` : run.phase} · {run.progress.completedTasks}/{run.progress.totalTasks}
              </span>
            </button>
            <button type="button" onClick={onOpenDashboard} className="shrink-0 rounded-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">监督看板</button>
            <button type="button" onClick={() => setExpanded(value => !value)} className="rounded p-1 hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label={expanded ? '收起自动监督详情' : '展开自动监督详情'}>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-[var(--color-muted-foreground)]">尚未监督 · 可输入“按当前规划推进”</span>
            <button type="button" onClick={onOpenDashboard} className="rounded-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">监督看板</button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setChangeId(''); setSelectedIds([]); setSelectionTouched(false); setPickerOpen(true) }}>
              自动推进
            </Button>
          </>
        )}
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border)] px-3 py-4 sm:px-4">
          {run ? <SupervisionSummary run={run} now={budgetNow} batch={batchQuery.data}
              taskQueries={batchProgress} pending={control.isPending}
              onAction={action => control.mutate(action)}
              projectControl={<ProjectExecutionControl sessionId={sessionId} compact />}
              error={error ? messageOf(error) : undefined} onRetry={() => { control.reset(); void runQuery.refetch() }}
              batchError={batchQuery.isError} onRetryBatch={() => void batchQuery.refetch()} />
            : <ProjectExecutionControl sessionId={sessionId} compact />}
        </div>
      )}
      <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Dialog.Portal container={portalContainer}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4 shadow-lg focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <div><Dialog.Title className="text-base font-semibold">选择当前会话的执行规格</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[var(--color-muted-foreground)]">根据最近会话推荐，确认后才启动自动监督。</Dialog.Description></div>
              <Dialog.Close className="rounded p-1 text-[var(--color-muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label="关闭规格选择">关闭</Dialog.Close>
            </div>
            <div className="mt-4 min-h-0 space-y-1 overflow-y-auto">
              {candidatesQuery.isFetching && <p className="text-sm text-[var(--color-muted-foreground)]">正在探索会话中的规格…</p>}
              {aiQuery.isFetching && <p className="text-xs text-[var(--color-muted-foreground)]">AI 正在比对最近会话与规格内容；目录候选可先选择</p>}
              {aiQuery.error && <p className="text-xs text-[var(--color-muted-foreground)]">AI 推荐暂不可用，已保留目录候选。</p>}
              {candidates.map((candidate: AutopilotBindingCandidate) => (
                <label key={candidate.changeId} className="flex cursor-pointer gap-3 border-b border-[var(--color-border)] py-2 text-sm">
                  <input type="checkbox" checked={selectedIds.includes(candidate.changeId)} onChange={() => {
                    const next = selectedIds.includes(candidate.changeId)
                      ? selectedIds.filter(id => id !== candidate.changeId) : [...selectedIds, candidate.changeId]
                    setSelectedIds(next)
                    setSelectionTouched(true)
                    setChangeId(next.includes(changeId) ? changeId : next[0] ?? '')
                    setGoal(next.length ? `完成 OpenSpec changes ${next.join('、')}` : '')
                  }} />
                  <span className="min-w-0"><span className="block break-all font-medium">{candidate.changeId}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">{candidate.completedTasks}/{candidate.totalTasks} task · {selectedIds.includes(candidate.changeId) ? selectedChecks[selectedIds.indexOf(candidate.changeId)]?.isFetching ? '正在预检…' : selectedChecks[selectedIds.indexOf(candidate.changeId)]?.data?.reason ?? candidate.reason : candidate.reason}{aiQuery.data?.includes(candidate.changeId) ? ' · AI 推荐' : candidate.relevance > 0 ? ' · 文本相关' : ''}</span></span>
                </label>
              ))}
              {candidatesQuery.data?.length === 0 && !candidatesQuery.isFetching && !candidatesQuery.error && (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">当前项目缺少可绑定的 OpenSpec 规格</p>
                  <p className="text-[var(--color-muted-foreground)]">是否根据本会话最近的规划补齐规格？补齐后会重新预检，规格合格后再确认推进。</p>
                  {onSupplementSpec && <Button variant="outline" onClick={() => requestSupplement(null)}>补齐规格并继续</Button>}
                </div>
              )}
              {selected && checkQuery.data && !checkQuery.data.ready && !checkQuery.isFetching && onSupplementSpec && checkQuery.data.totalTasks !== checkQuery.data.completedTasks && (
                <div className="space-y-2 border-t border-[var(--color-border)] pt-3 text-sm">
                  <p className="text-amber-700 dark:text-amber-400">所选规格未通过预检：{checkQuery.data.reason}</p>
                  <Button variant="outline" onClick={() => requestSupplement(changeId)}>补齐该规格并继续</Button>
                </div>
              )}
              {candidatesQuery.error && <p role="alert" className="text-sm text-red-600">{messageOf(candidatesQuery.error)}</p>}
              {checkQuery.error && <p role="alert" className="text-sm text-red-600">{messageOf(checkQuery.error)}</p>}
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">已选 {selectedIds.length} 项 · 按勾选顺序推进；每项完成后才进入下一项。</p>
            <label className="mt-2 space-y-1 text-sm"><span>监督目标</span><input value={goal} onChange={event => { setGoal(event.target.value); setSelectionTouched(true) }} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2" /></label>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={autoArchive} onChange={event => setAutoArchive(event.target.checked)} />完成后自动归档</label>
            {start.error && <p role="alert" className="mt-2 text-sm text-red-600">{messageOf(start.error)}，请重新探索后再确认。</p>}
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => {
              void candidatesQuery.refetch()
              void aiQuery.refetch()
              void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-check', sessionId, projectRoot] })
            }}>重新探索</Button>
              <Button onClick={() => start.mutate()} disabled={!selected || !allReady || !goal.trim() || start.isPending || candidatesQuery.isFetching}>{start.isPending ? '正在启动…' : '确认并推进'}</Button></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
