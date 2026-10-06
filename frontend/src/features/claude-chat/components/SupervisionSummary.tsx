import type { ReactNode } from 'react'
import { Play, Square, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AutopilotTask, SessionAutopilotRun } from '../types'

interface TaskQuery {
  data?: AutopilotTask[]
  isError?: boolean
  isPending?: boolean
  refetch: () => unknown
}

interface Props {
  run: SessionAutopilotRun
  now: number
  batch?: { changeIds: string[]; currentIndex: number; deferred: { changeId: string; reason: string }[] } | null
  taskQueries?: (TaskQuery | undefined)[]
  pending: boolean
  onAction: (action: 'resume' | 'stop') => void
  recoveryAction?: ReactNode
  projectControl: ReactNode
  error?: string
  onRetry: () => void
  batchError?: boolean
  onRetryBatch?: () => void
}

const labels = { ACTIVE: '正在监督', PAUSED: '已暂停', WAITING_USER: '需要处理', FAILED: '监督失败', COMPLETED: '已完成', STOPPED: '已停止' }
const warning = 'text-amber-700 dark:text-amber-400'
const muted = 'text-[var(--color-muted-foreground)]'
const percent = (used: number, total: number) => total > 0 && Number.isFinite(used) && Number.isFinite(total)
  ? Math.min(100, Math.max(0, used / total * 100)) : undefined

function duration(ms: number) {
  if (!Number.isFinite(ms)) return '未知'
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

function Progress({ value, label, risk = false }: { value?: number; label: string; risk?: boolean }) {
  if (value === undefined) return <div className="h-1" aria-label={`${label}暂无数据`} />
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={Math.round(value)} className="h-1 overflow-hidden rounded-sm bg-[var(--color-border)]">
    <div className={cn('h-full', risk ? 'bg-amber-600 dark:bg-amber-400' : 'bg-[var(--color-primary)]')} style={{ width: `${value}%` }} />
  </div>
}

function Metric({ title, value, detail, progress, risk = false }: {
  title: string; value: string; detail: string; progress?: number; risk?: boolean
}) {
  return <div className="min-w-0 space-y-2">
    <div className={muted}>{title}</div>
    <div className={cn('text-lg font-medium tabular-nums leading-tight', risk && warning)}>{value}</div>
    <Progress value={progress} label={title} risk={risk} />
    <div className={cn('text-xs tabular-nums', risk ? warning : muted)}>{detail}</div>
  </div>
}

/** Read-only projection: task facts and lifecycle actions stay with the existing session owner. */
export function SupervisionSummary({ run, now, batch, taskQueries = [], pending, onAction, recoveryAction,
  projectControl, error, onRetry, batchError, onRetryBatch }: Props) {
  const terminal = run.state === 'COMPLETED' || run.state === 'STOPPED'
  const deadline = Date.parse(run.deadlineAt)
  const started = Date.parse(run.startedAt)
  const remaining = Math.max(0, deadline - now)
  const timeRatio = percent(remaining, deadline - started)
  const turns = percent(run.turnCount, run.maxTurns)
  const completed = percent(run.progress.completedTasks, run.progress.totalTasks)
  const budgetEnded = !terminal && (run.turnCount >= run.maxTurns || now >= deadline)
  const needsAttention = ['WAITING_USER', 'FAILED'].includes(run.state)
  const runtimeMissing = run.state === 'ACTIVE' && !run.layers.forgeRuntimeActive
  const rows = (batch?.changeIds ?? [run.changeId]).map((id, index) => {
    const query = taskQueries[index]
    const tasks = query?.data
    const counts = tasks ? { completedTasks: tasks.filter(task => task.done).length, totalTasks: tasks.length }
      : id === run.changeId ? run.progress : undefined
    const manual = tasks?.filter(task => !task.done && /^\[MANUAL_(CONFIRMATION|PRODUCTION)\]\s/.test(task.description)) ?? []
    const deferred = batch?.deferred?.find(item => item.changeId === id)
    return { id, query, counts, manual, deferred, current: id === run.changeId,
      status: id === run.changeId ? '当前' : deferred ? '待回复' : index < (batch?.currentIndex ?? 0) ? '已推进' : '待推进' }
  })
  const attention = rows.filter(row => row.deferred || row.manual.length > 0)
  const extraIssue = needsAttention && run.reason && !attention.some(row => row.deferred?.reason === run.reason)
  const issueCount = attention.length + Number(Boolean(extraIssue)) + Number(budgetEnded) + Number(runtimeMissing)

  return <div className="min-w-0 space-y-4 text-xs" aria-label="监督状态摘要">
    <header className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', needsAttention || budgetEnded || runtimeMissing
              ? 'bg-amber-600' : run.state === 'ACTIVE' ? 'bg-emerald-600' : 'bg-[var(--color-muted-foreground)]')} />
            {error ? '监督状态刷新失败' : budgetEnded ? '监督预算已用尽' : runtimeMissing ? '监督未接管' : labels[run.state]}
          </h3>
          <p className={cn('mt-1 break-words', muted)}>{run.phase} · {run.currentTaskId ? `Task ${run.currentTaskId} · ` : ''}{run.branchAtStart || '未识别分支'} · generation {run.generation}</p>
        </div>
        {!terminal && (recoveryAction || <Button size="sm" variant="outline" className="min-h-11 shrink-0" disabled={pending}
          onClick={() => onAction(run.state === 'ACTIVE' ? 'stop' : 'resume')}>
          {run.state === 'ACTIVE' ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
          {pending ? '处理中…' : run.state === 'ACTIVE' ? '停止' : '恢复'}
        </Button>)}
      </div>
      <p className={muted}>Forge Runtime {run.layers.forgeRuntimeActive ? '已接管' : '未接管'} · Agent Skill {run.layers.agentSkillActivated ? '已加载' : run.layers.agentSkillProvisioned ? '待引擎确认' : '未部署'}</p>
      {error && <p role="alert" className={warning}>当前显示上次已知状态 · {error} <button type="button" className="min-h-11 underline" onClick={onRetry}>重试读取</button></p>}
      {projectControl}
    </header>

    <section aria-label="进度与资源" className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[var(--color-border)] py-4 sm:grid-cols-4">
      <Metric title="执行进度" value={completed === undefined ? '—' : `${Math.round(completed)}%`} progress={completed}
        detail={`${run.progress.completedTasks} / ${run.progress.totalTasks}`} />
      <Metric title="轮次预算" value={`${run.turnCount} / ${run.maxTurns}`} progress={turns} risk={!terminal && turns !== undefined && turns >= 90}
        detail={`剩余 ${Math.max(0, run.maxTurns - run.turnCount)} 轮`} />
      <Metric title="监督窗口" value={terminal ? '已结束' : Number.isFinite(deadline) ? `剩余 ${duration(remaining)}` : '未知'}
        progress={terminal ? undefined : timeRatio} risk={!terminal && Number.isFinite(remaining) && remaining <= 30 * 60_000}
        detail={`已运行 ${duration((terminal ? Date.parse(run.updatedAt) : now) - started)}`} />
      <Metric title="上下文" value="未提供" detail="监督接口暂无占用数据" />
    </section>

    {(issueCount > 0 || batchError) && <section aria-label="需要处理" className="space-y-2">
      <h4 className="font-medium">需要处理 <span className={cn('ml-1 tabular-nums', warning)}>{issueCount || ''}</span></h4>
      {attention.map(row => <div key={row.id} className="flex items-start gap-2">
        <TriangleAlert aria-hidden="true" className={cn('mt-0.5 size-3.5 shrink-0', warning)} />
        <div className="min-w-0"><p className="break-all font-medium">{row.id}</p>
          <p className={cn('mt-0.5 break-words', warning)}>{row.deferred?.reason || row.manual.map(task => `Task ${task.id} ${task.description.startsWith('[MANUAL_PRODUCTION]') ? '待生产验收' : '待人工确认'}`).join(' · ')}</p>
        </div>
      </div>)}
      {extraIssue && <p className={cn('break-words', warning)}>{run.reason}</p>}
      {budgetEnded && <p className={warning}>预算已到限，请恢复前核对轮次与截止时间。</p>}
      {runtimeMissing && <p className={warning}>Runtime 未接管当前运行，请重新读取监督状态。<button type="button" className="min-h-11 underline" onClick={onRetry}>重新读取</button></p>}
      {batchError && <p role="alert" className={warning}>批次状态读取失败，已有数据可能过期。<button type="button" className="min-h-11 underline" onClick={onRetryBatch}>重试批次</button></p>}
    </section>}

    <section aria-label="批次进度" className="space-y-2">
      <h4 className="font-medium">批次进度</h4>
      <ol className="divide-y divide-[var(--color-border)]">
        {rows.map(row => <li key={row.id} className="space-y-2 py-3 first:pt-0">
          <div className="flex items-start justify-between gap-3"><span className={cn('min-w-0 break-all', row.current && 'font-medium')}>{row.id}</span>
            <span className={cn('shrink-0', row.deferred ? warning : muted)}>{row.status}</span></div>
          <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><Progress label={`${row.id} 完成度`}
            value={row.counts && percent(row.counts.completedTasks, row.counts.totalTasks)} /></div>
            <span className={cn('shrink-0 tabular-nums', muted)}>{row.counts ? `${row.counts.completedTasks} / ${row.counts.totalTasks}` : row.query?.isPending ? '读取中…' : '未提供'}</span></div>
          {row.manual.length > 0 && <p className={muted}>{[
            row.manual.filter(task => task.description.startsWith('[MANUAL_CONFIRMATION]')).length && `人工确认 ${row.manual.filter(task => task.description.startsWith('[MANUAL_CONFIRMATION]')).length}`,
            row.manual.filter(task => task.description.startsWith('[MANUAL_PRODUCTION]')).length && `生产验收 ${row.manual.filter(task => task.description.startsWith('[MANUAL_PRODUCTION]')).length}`,
          ].filter(Boolean).join(' · ')}</p>}
          {row.query?.isError && <p role="alert" className={warning}>{row.query.data ? '刷新失败，显示上次数据' : '任务读取失败'} <button type="button" className="min-h-11 underline" onClick={() => row.query?.refetch()}>重试 {row.id}</button></p>}
        </li>)}
      </ol>
    </section>

    <details className="border-t border-[var(--color-border)] pt-1">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">执行上下文 <span className={muted}>展开 / 收起</span></summary>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 pb-3">
        <dt className={muted}>监督目标</dt><dd className="break-words">{run.goal}</dd>
        <dt className={muted}>绑定规格</dt><dd className="break-all">{run.changeId}<div className={cn('mt-1', muted)}>{(run.artifactPaths.specs ?? []).join(' · ') || '未返回规格路径'}</div></dd>
        <dt className={muted}>开始 / 截止</dt><dd className="break-words">{run.startedAt} / {run.deadlineAt}</dd>
        <dt className={muted}>续跑状态</dt><dd>{run.noProgressCount === 0 ? '本轮未触发额外暂停' : `当前连续续跑 ${run.noProgressCount} 轮`}</dd>
        <dt className={muted}>更新说明</dt><dd className="break-words">{run.reason || '暂无'}<div className={muted}>{run.updatedAt}</div></dd>
      </dl>
      <p className={cn('pb-3', muted)}>历时包含等待与暂停；等待不顺延截止时间。人工待办仍属于未完成项。上下文占用与缓存命中率不是同一指标。</p>
    </details>
  </div>
}
