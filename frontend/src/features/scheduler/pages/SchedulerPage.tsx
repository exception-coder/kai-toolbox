import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Clock3, Pause, Play, RefreshCw, Search, TimerReset } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  listExecutions,
  listSchedulerTasks,
  pauseTask,
  resumeTask,
  runTask,
  subscribeScheduler,
  updateTaskCron,
} from '../api'
import type { SchedulerTask } from '../types'
import { describeSchedule, technicalSchedule } from '../schedulePresentation'

type SourceFilter = 'ALL' | 'MANAGED' | 'SPRING'

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—'
}

function statusTone(status?: string) {
  if (status === 'SUCCESS') return 'success' as const
  if (status === 'FAILED' || status === 'ABORTED' || status === 'FAILURE') return 'destructive' as const
  if (status === 'RUNNING' || status === 'STARTED') return 'info' as const
  return 'outline' as const
}

export function SchedulerPage() {
  const qc = useQueryClient()
  const [source, setSource] = useState<SourceFilter>('ALL')
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = useQuery({ queryKey: ['scheduler', 'tasks'], queryFn: listSchedulerTasks })
  const tasks = query.data ?? []
  const selected = tasks.find((task) => task.id === selectedId) ?? null

  useEffect(() => subscribeScheduler(() => {
    void qc.invalidateQueries({ queryKey: ['scheduler'] })
  }), [qc])

  const visible = useMemo(() => tasks.filter((task) => {
    const sourceMatch = source === 'ALL' || task.source === source
    const text = `${task.name} ${task.id} ${task.owner}`.toLowerCase()
    return sourceMatch && text.includes(keyword.trim().toLowerCase())
  }), [tasks, source, keyword])

  const counts = {
    total: tasks.length,
    managed: tasks.filter((task) => task.source === 'MANAGED').length,
    running: tasks.filter((task) => task.running).length,
    paused: tasks.filter((task) => task.controllable && !task.enabled).length,
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="border-b pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              <TimerReset className="h-4 w-4" /> Runtime operations
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">调度中心</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
              原生 Spring 任务保持只读；增强任务可运行、暂停并持久化 Cron 设置与执行结果。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn(query.isFetching && 'animate-spin')} />刷新
          </Button>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:flex sm:gap-10">
          {[
            ['已登记', counts.total], ['增强任务', counts.managed], ['运行中', counts.running], ['已暂停', counts.paused],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2"><dt className="text-[var(--color-muted-foreground)]">{label}</dt><dd className="font-mono text-base font-semibold">{value}</dd></div>
          ))}
        </dl>
      </header>

      <div className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {(['ALL', 'MANAGED', 'SPRING'] as SourceFilter[]).map((value) => (
            <Button key={value} variant={source === value ? 'secondary' : 'ghost'} size="sm" onClick={() => setSource(value)}>
              {{ ALL: '全部', MANAGED: '增强任务', SPRING: 'Spring 原生' }[value]}
            </Button>
          ))}
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索任务、ID 或负责人" className="pl-9" />
        </label>
      </div>

      {query.isLoading && <State message="正在读取应用内定时任务…" />}
      {query.error && <State message={`读取失败：${query.error.message}`} action={<Button size="sm" onClick={() => query.refetch()}>重试</Button>} />}
      {!query.isLoading && !query.error && visible.length === 0 && <State message="没有符合当前筛选条件的任务。" action={<Button size="sm" variant="outline" onClick={() => { setSource('ALL'); setKeyword('') }}>清除筛选</Button>} />}

      {visible.length > 0 && (
        <div className="overflow-hidden border-x border-b bg-[var(--color-card)]">
          <div className="hidden grid-cols-[minmax(220px,1.5fr)_140px_minmax(180px,1fr)_180px_110px] gap-4 border-b bg-[var(--color-muted)]/45 px-4 py-2 text-xs font-medium text-[var(--color-muted-foreground)] md:grid">
            <span>任务</span><span>来源 / 状态</span><span>调度计划</span><span>下次执行</span><span className="text-right">操作</span>
          </div>
          {visible.map((task) => <TaskRow key={task.id} task={task} onOpen={() => setSelectedId(task.id)} onChanged={() => qc.invalidateQueries({ queryKey: ['scheduler'] })} />)}
        </div>
      )}

      <TaskDetail task={selected} open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)} />
    </div>
  )
}

function TaskRow({ task, onOpen, onChanged }: { task: SchedulerTask; onOpen: () => void; onChanged: () => void }) {
  const action = useMutation({
    mutationFn: () => task.enabled ? pauseTask(task.id) : resumeTask(task.id),
    onSuccess: onChanged,
  })
  return (
    <div className="grid gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(220px,1.5fr)_140px_minmax(180px,1fr)_180px_110px] md:items-center md:gap-4">
      <button className="min-w-0 text-left" onClick={onOpen}>
        <div className="truncate text-sm font-medium hover:text-[var(--color-primary)]">{task.name}</div>
        <div className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{task.description || '暂未补充任务说明'}</div>
      </button>
      <div className="flex items-center gap-2">
        <Badge variant={task.source === 'MANAGED' ? 'info' : 'outline'}>{task.source === 'MANAGED' ? '增强' : 'Spring'}</Badge>
        {task.running ? <Badge variant="info">运行中</Badge> : task.enabled ? <span className="text-xs text-[var(--color-muted-foreground)]">待命</span> : <Badge variant="warning">已暂停</Badge>}
      </div>
      <div className="min-w-0"><div className="text-xs font-medium">{describeSchedule(task)}</div><div className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">{technicalSchedule(task)}</div></div>
      <div className="text-xs text-[var(--color-muted-foreground)]"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{formatTime(task.nextExecution)}</div>
      <div className="flex justify-end gap-1">
        {task.controllable && <Button variant="ghost" size="icon" title={task.enabled ? '暂停计划' : '恢复计划'} onClick={() => action.mutate()} disabled={action.isPending}>{task.enabled ? <Pause /> : <Play />}</Button>}
        <Button variant="outline" size="sm" onClick={onOpen}>详情</Button>
      </div>
    </div>
  )
}

function TaskDetail({ task, open, onOpenChange }: { task: SchedulerTask | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const history = useQuery({ queryKey: ['scheduler', 'executions', task?.id], queryFn: () => listExecutions(task!.id), enabled: !!task?.controllable })
  const [cron, setCron] = useState('')
  const [zone, setZone] = useState('')
  useEffect(() => { setCron(task?.scheduleExpression ?? ''); setZone(task?.zone ?? '') }, [task])
  const changed = () => void qc.invalidateQueries({ queryKey: ['scheduler'] })
  const run = useMutation({ mutationFn: () => runTask(task!.id), onSuccess: changed })
  const saveCron = useMutation({ mutationFn: () => updateTaskCron(task!.id, cron, zone), onSuccess: changed })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-xl overflow-y-auto p-0 sm:w-[560px] sm:max-w-none">
        {task && <>
          <div className="border-b px-5 py-5 pr-12"><SheetTitle>{task.name}</SheetTitle><SheetDescription className="mt-1 font-mono text-xs">{task.id}</SheetDescription></div>
          <div className="space-y-6 p-5">
            <section><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">运行上下文</h3><dl className="grid grid-cols-[96px_1fr] gap-y-2 text-sm"><dt className="text-[var(--color-muted-foreground)]">来源</dt><dd>{task.source === 'MANAGED' ? 'Toolbox 增强任务' : 'Spring @Scheduled'}</dd><dt className="text-[var(--color-muted-foreground)]">负责人</dt><dd>{task.owner || '未声明'}</dd><dt className="text-[var(--color-muted-foreground)]">调度计划</dt><dd><div>{describeSchedule(task)}</div><div className="mt-0.5 font-mono text-xs text-[var(--color-muted-foreground)]">{technicalSchedule(task)}</div></dd><dt className="text-[var(--color-muted-foreground)]">状态</dt><dd>{task.running ? '运行中' : task.enabled ? '待命' : '已暂停'}</dd><dt className="text-[var(--color-muted-foreground)]">下次执行</dt><dd>{formatTime(task.nextExecution)}</dd></dl>{task.description && <p className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">{task.description}</p>}</section>
            {task.controllable && <section className="border-t pt-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-medium">立即运行</h3><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">按当前并发策略提交一次手动执行。</p></div><Button size="sm" onClick={() => run.mutate()} disabled={run.isPending || task.running}><Play />运行一次</Button></div>{run.error && <p className="mt-2 text-xs text-[var(--color-destructive)]">{run.error.message}</p>}</section>}
            {task.controllable && task.scheduleType === 'CRON' && <section className="border-t pt-5"><h3 className="text-sm font-medium">Cron 计划</h3><div className="mt-3 grid gap-3"><label className="text-xs text-[var(--color-muted-foreground)]">表达式<Input className="mt-1 font-mono" value={cron} onChange={(event) => setCron(event.target.value)} /></label><label className="text-xs text-[var(--color-muted-foreground)]">时区<Input className="mt-1" value={zone} onChange={(event) => setZone(event.target.value)} /></label><Button className="justify-self-start" variant="outline" size="sm" onClick={() => saveCron.mutate()} disabled={saveCron.isPending}>保存计划</Button>{saveCron.error && <p className="text-xs text-[var(--color-destructive)]">{saveCron.error.message}</p>}</div></section>}
            {task.controllable && <section className="border-t pt-5"><h3 className="mb-3 text-sm font-medium">最近执行</h3>{history.isLoading && <p className="text-xs text-[var(--color-muted-foreground)]">读取历史中…</p>}{history.data?.length === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">暂无执行记录，运行一次后将在这里显示结果。</p>}<div className="divide-y">{history.data?.map((item) => <div key={item.id} className="py-3 text-xs"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" /><Badge variant={statusTone(item.status)}>{item.status}</Badge><span>{item.triggerSource === 'MANUAL' ? '手动' : '计划'}</span></span><span className="text-[var(--color-muted-foreground)]">{item.durationMs == null ? '—' : `${item.durationMs} ms`}</span></div><div className="mt-1 text-[var(--color-muted-foreground)]">{formatTime(item.startTime)}</div>{item.errorSummary && <p className="mt-2 text-[var(--color-destructive)]">{item.errorSummary}</p>}</div>)}</div></section>}
            {!task.controllable && <section className="border-t pt-5"><p className="text-sm text-[var(--color-muted-foreground)]">该任务由 Spring 原生调度器持有。看板只读取公开运行元数据，不会取消、替换或持久化它的每次执行。</p></section>}
          </div>
        </>}
      </SheetContent>
    </Sheet>
  )
}

function State({ message, action }: { message: string; action?: React.ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-3 border-x border-b bg-[var(--color-card)] px-6 text-center text-sm text-[var(--color-muted-foreground)]"><span>{message}</span>{action}</div>
}
