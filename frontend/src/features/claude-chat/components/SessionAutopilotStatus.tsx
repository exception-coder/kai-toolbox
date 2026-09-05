import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, ChevronUp, CirclePause, Play, ShieldCheck, Square, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  controlSessionAutopilot,
  getSessionAutopilot,
  listSessionOpenSpecChanges,
  startSessionAutopilot,
} from '../api'
import type { SessionAutopilotRun } from '../types'

interface SessionAutopilotStatusProps {
  sessionId: string
  projectRoot: string
  onOpenDashboard: () => void
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
export function SessionAutopilotStatus({ sessionId, projectRoot, onOpenDashboard }: SessionAutopilotStatusProps) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [changeId, setChangeId] = useState('')
  const [goal, setGoal] = useState('')
  const [autoArchive, setAutoArchive] = useState(true)
  const runQuery = useQuery({
    queryKey: ['claude-chat-autopilot', sessionId],
    queryFn: () => getSessionAutopilot(sessionId),
    staleTime: 4_000,
    refetchInterval: 15_000,
  })
  const changesQuery = useQuery({
    queryKey: ['claude-chat-openspec-changes', sessionId, projectRoot],
    queryFn: () => listSessionOpenSpecChanges(sessionId, projectRoot),
    enabled: expanded && !runQuery.data,
    staleTime: 10_000,
  })
  useEffect(() => {
    const onState = (event: Event) => {
      const next = (event as CustomEvent<SessionAutopilotRun>).detail
      if (next?.sessionId === sessionId) queryClient.setQueryData(['claude-chat-autopilot', sessionId], next)
    }
    window.addEventListener('claude-chat:autopilot-state', onState)
    return () => window.removeEventListener('claude-chat:autopilot-state', onState)
  }, [queryClient, sessionId])
  useEffect(() => {
    const changes = changesQuery.data ?? []
    if (!changeId && changes.length > 0) {
      setChangeId(changes[0].id)
      setGoal(`完成 OpenSpec change ${changes[0].id}`)
    }
  }, [changeId, changesQuery.data])

  const refresh = (run: SessionAutopilotRun) => {
    queryClient.setQueryData(['claude-chat-autopilot', sessionId], run)
    void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-runs'] })
  }
  const start = useMutation({
    mutationFn: () => startSessionAutopilot(sessionId, { projectRoot, changeId, goal, autoArchive }),
    onSuccess: run => { refresh(run); setExpanded(true) },
  })
  const control = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'stop') => {
      if (!runQuery.data) throw new Error('自动监督状态尚未加载')
      return controlSessionAutopilot(sessionId, action, runQuery.data.version)
    },
    onSuccess: refresh,
  })
  const run = runQuery.data
  const progress = run?.progress.totalTasks
    ? Math.round(run.progress.completedTasks / run.progress.totalTasks * 100) : 0
  const specPaths = useMemo(() => run?.artifactPaths.specs ?? [], [run])
  const error = start.error ?? control.error ?? runQuery.error ?? changesQuery.error

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
            <span className="flex-1 text-[var(--color-muted-foreground)]">当前会话尚未绑定 OpenSpec 自动监督</span>
            <button type="button" onClick={onOpenDashboard} className="rounded-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">监督看板</button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setExpanded(value => !value)}>
              自动推进
            </Button>
          </>
        )}
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-[var(--color-border)] px-3 py-3 text-xs lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
          {run ? (
            <>
              <div className="min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{run.goal}</span>
                  <span className="tabular-nums text-[var(--color-muted-foreground)]">{progress}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[var(--color-border)]" aria-label={`任务进度 ${progress}%`}>
                  <div className="h-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} />
                </div>
                <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[var(--color-muted-foreground)]">
                  <dt>执行上下文</dt><dd className="truncate text-[var(--color-foreground)]">{run.branchAtStart || '未识别分支'} · generation {run.generation}</dd>
                  <dt>当前阶段</dt><dd className="text-[var(--color-foreground)]">{run.phase}{run.currentTaskId ? ` / task ${run.currentTaskId}` : ''}</dd>
                  <dt>绑定 Specs</dt><dd className="space-y-0.5 text-[var(--color-foreground)]">{specPaths.length ? specPaths.map(path => <div key={path} className="truncate" title={path}>{path}</div>) : '当前 change 未返回 delta spec 路径'}</dd>
                  <dt>停止预算</dt><dd className="text-[var(--color-foreground)]">轮次 {run.turnCount}/{run.maxTurns} · 无进展 {run.noProgressCount}/{run.maxNoProgress}</dd>
                </dl>
                {run.reason && <p className="flex items-start gap-1.5 text-[var(--color-muted-foreground)]"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{run.reason}</p>}
              </div>
              <div className="space-y-2 border-t border-[var(--color-border)] pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                <div className="font-medium">双层兜底</div>
                <div className="flex items-center justify-between"><span>Agent Skill</span><span className={run.layers.agentSkillActivated ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>{run.layers.agentSkillActivated ? '已由引擎加载' : run.layers.agentSkillProvisioned ? '已部署，待引擎确认' : '未部署'}</span></div>
                <div className="flex items-center justify-between"><span>Forge Runtime</span><span className={run.layers.forgeRuntimeActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}>{run.layers.forgeRuntimeActive ? '正在监督' : '未接管'}</span></div>
                <div className="flex items-center gap-2 pt-1">
                  {run.state === 'ACTIVE' ? (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => control.mutate('pause')} disabled={control.isPending}><CirclePause className="size-3.5" />暂停</Button>
                  ) : run.state === 'PAUSED' || run.state === 'WAITING_USER' || run.state === 'FAILED' ? (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => control.mutate('resume')} disabled={control.isPending}><Play className="size-3.5" />恢复</Button>
                  ) : <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><ShieldCheck className="size-3.5" />运行已收口</span>}
                  {!['COMPLETED', 'STOPPED'].includes(run.state) && <Button size="sm" variant="ghost" className="h-7" onClick={() => control.mutate('stop')} disabled={control.isPending}><Square className="size-3" />停止</Button>}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3 lg:col-span-2">
              <div>
                <div className="font-medium">绑定当前会话到 OpenSpec change</div>
                <p className="mt-1 text-[var(--color-muted-foreground)]">启用后浏览器关闭也会由 Forge Runtime 监督；手动发送消息会自动暂停并交还控制权。</p>
              </div>
              {changesQuery.isLoading ? <p className="text-[var(--color-muted-foreground)]">正在读取 OpenSpec changes…</p> : changesQuery.data?.length ? (
                <div className="grid gap-2 md:grid-cols-[minmax(220px,0.6fr)_minmax(260px,1fr)_auto_auto] md:items-end">
                  <label className="space-y-1"><span className="text-[var(--color-muted-foreground)]">Change</span><select value={changeId} onChange={event => { setChangeId(event.target.value); setGoal(`完成 OpenSpec change ${event.target.value}`) }} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">{changesQuery.data.map(change => <option key={change.id} value={change.id}>{change.id} · {change.completedTasks}/{change.totalTasks}</option>)}</select></label>
                  <label className="space-y-1"><span className="text-[var(--color-muted-foreground)]">监督目标</span><input value={goal} onChange={event => setGoal(event.target.value)} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" /></label>
                  <label className="flex h-9 items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={autoArchive} onChange={event => setAutoArchive(event.target.checked)} />完成后归档</label>
                  <Button className="h-9" onClick={() => start.mutate()} disabled={!changeId || !goal.trim() || start.isPending}>{start.isPending ? '正在启用…' : '启用监督'}</Button>
                </div>
              ) : <p className="text-[var(--color-muted-foreground)]">当前项目没有可绑定的活动 OpenSpec change。</p>}
            </div>
          )}
          {error && <p role="alert" className="lg:col-span-2 text-red-600">{messageOf(error)}</p>}
        </div>
      )}
    </section>
  )
}
