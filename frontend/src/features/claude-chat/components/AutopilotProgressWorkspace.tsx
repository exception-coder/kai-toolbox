import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CirclePause, Play, RefreshCw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { controlSessionAutopilot, getSessionAutopilot, listAutopilotTasks } from '../api'

const phases = [
  ['APPLY', '实施任务'], ['VERIFY', '实现核验'], ['QUALITY_GATE', '质量门禁'],
  ['STRICT_VALIDATE', '规格校验'], ['ARCHIVE', '归档'], ['DONE', '完成'],
] as const

const stateText: Record<string, string> = {
  ACTIVE: '监督中', PAUSED: '已暂停', WAITING_USER: '待处理', FAILED: '失败',
  COMPLETED: '已完成', STOPPED: '已停止',
}

/** 当前开发会话的权威自动推进快照；全局看板仍负责跨会话浏览。 */
export function AutopilotProgressWorkspace({ sessionId, onOpenAll, onOpenConversation }: {
  sessionId: string
  onOpenAll: () => void
  onOpenConversation: () => void
}) {
  const queryClient = useQueryClient()
  const runQuery = useQuery({
    queryKey: ['claude-chat-autopilot', sessionId],
    queryFn: () => getSessionAutopilot(sessionId),
    refetchInterval: 15_000,
  })
  const tasksQuery = useQuery({
    queryKey: ['claude-chat-autopilot-tasks', sessionId],
    queryFn: () => listAutopilotTasks(sessionId),
    enabled: Boolean(runQuery.data),
    refetchInterval: runQuery.data?.state === 'ACTIVE' ? 15_000 : false,
  })
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-tasks', sessionId] })
    }
    window.addEventListener('claude-chat:autopilot-changed', refresh)
    return () => window.removeEventListener('claude-chat:autopilot-changed', refresh)
  }, [queryClient, sessionId])
  const control = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'stop') => {
      if (!runQuery.data) throw new Error('监督状态尚未加载')
      return controlSessionAutopilot(sessionId, action, runQuery.data.version)
    },
    onSuccess: run => {
      queryClient.setQueryData(['claude-chat-autopilot', sessionId], run)
      void queryClient.invalidateQueries({ queryKey: ['claude-chat-autopilot-runs'] })
    },
  })
  const run = runQuery.data
  const progress = run?.progress.totalTasks
    ? Math.round(run.progress.completedTasks / run.progress.totalTasks * 100) : 0

  return <section className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7" aria-label="当前会话自动推进">
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div><button type="button" onClick={onOpenAll} className="mb-2 text-xs text-[var(--color-muted-foreground)] underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">全部推进</button><h2 className="text-lg font-semibold">任务推进</h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">当前会话的 OpenSpec 执行状态</p></div>
        <Button size="sm" variant="outline" onClick={() => { void runQuery.refetch(); void tasksQuery.refetch() }} aria-label="刷新任务推进状态"><RefreshCw className="size-4" />刷新</Button>
      </div>
      {runQuery.isPending ? <p className="py-8 text-sm text-[var(--color-muted-foreground)]">正在读取监督状态…</p>
        : runQuery.error ? <div className="py-8 text-sm"><p role="alert">读取监督状态失败：{String(runQuery.error)}</p><Button className="mt-3" onClick={() => runQuery.refetch()}>重试</Button></div>
        : !run ? <div className="py-8 text-sm"><p className="font-medium">此会话尚未开启自动推进</p><p className="mt-1 text-[var(--color-muted-foreground)]">回到对话，输入“按当前规划推进”并确认要绑定的规格。</p><Button className="mt-4" variant="outline" onClick={onOpenConversation}>返回对话</Button></div>
          : <>
            <div className="py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="min-w-0"><p className="break-all text-sm font-semibold">{run.changeId}</p><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{run.goal}</p></div><span className="text-sm font-medium">{stateText[run.state] ?? run.state}</span></div>
              <div className="mt-4 h-1.5 bg-[var(--color-muted)]"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} /></div>
              <p className="mt-2 text-xs tabular-nums text-[var(--color-muted-foreground)]">已完成 {run.progress.completedTasks}/{run.progress.totalTasks} 项 · {progress}% · 第 {run.turnCount}/{run.maxTurns} 轮</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {run.state === 'ACTIVE' && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate('pause')}><CirclePause className="size-4" />暂停</Button>}
                {['PAUSED', 'WAITING_USER', 'FAILED'].includes(run.state) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate('resume')}><Play className="size-4" />恢复</Button>}
                {!['COMPLETED', 'STOPPED'].includes(run.state) && <Button size="sm" variant="ghost" disabled={control.isPending} onClick={() => control.mutate('stop')}><Square className="size-3.5" />停止</Button>}
              </div>
              {(run.reason || control.error) && <p className="mt-3 text-sm text-amber-700 dark:text-amber-400" role="status">{control.error ? String(control.error) : run.reason}</p>}
            </div>
            <div className="border-t border-[var(--color-border)] py-5">
              <h3 className="text-sm font-semibold">执行阶段</h3>
              <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                {phases.map(([id, label]) => <li key={id} className={cn('border-l-2 pl-2', run.phase === id ? 'border-[var(--color-primary)] font-medium' : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')}>{label}</li>)}
              </ol>
            </div>
            <div className="border-t border-[var(--color-border)] py-5">
              <h3 className="text-sm font-semibold">OpenSpec 任务</h3>
              {tasksQuery.isPending ? <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">正在读取任务…</p>
                : tasksQuery.error ? <p className="mt-3 text-sm text-amber-700" role="alert">任务快照暂不可读。<button className="ml-2 underline" onClick={() => tasksQuery.refetch()}>重试</button></p>
                  : <ol className="mt-3 divide-y divide-[var(--color-border)]">{tasksQuery.data?.map(task => <li key={`${task.applyOrdinal}-${task.id}`} className="flex gap-3 py-2.5 text-sm"><span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center border', task.done ? 'border-emerald-600 text-emerald-600' : task.id === run.currentTaskId ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-[var(--color-border)]')}>{task.done && <Check className="size-3" />}</span><span className="min-w-0"><span className="mr-2 tabular-nums text-[var(--color-muted-foreground)]">{task.id}</span>{task.description}{task.id === run.currentTaskId && !task.done && <span className="ml-2 text-xs text-[var(--color-primary)]">当前</span>}</span></li>)}</ol>}
            </div>
            {run.latestReport && <div className="border-t border-[var(--color-border)] py-5 text-sm"><h3 className="font-semibold">最近执行报告</h3><p className="mt-2">{run.latestReport.summary || '暂无摘要'}</p>{run.latestReport.nextAction && <p className="mt-1 text-[var(--color-muted-foreground)]">下一步：{run.latestReport.nextAction}</p>}</div>}
          </>}
    </div>
  </section>
}
