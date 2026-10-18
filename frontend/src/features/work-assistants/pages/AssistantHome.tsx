import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Bot, History, Mic, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { getCatalog, listSessions } from '../api'
import { RobotPortrait } from '../components/RobotPortrait'
import { useAssistantLauncher } from '../runtime/AssistantHost'

export function AssistantHome() {
  const launch = useAssistantLauncher()
  const { user } = useAuth()
  const catalog = useQuery({ queryKey: ['work-assistants', user?.userId, 'catalog'], queryFn: getCatalog, staleTime: 60_000 })
  const sessions = useQuery({ queryKey: ['work-assistants', user?.userId, 'sessions'], queryFn: listSessions })
  return <div className="min-h-full px-5 py-8 pb-24 md:px-12 md:py-12">
    <header className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b pb-6">
      <div><p className="mb-3 text-xs font-medium tracking-widest text-[var(--color-muted-foreground)]">FORGE · YOUR WORK CREW</p>
        <h1 className="text-3xl font-semibold tracking-tight">把琐事交给助理。</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">选一位伙伴，说清工作。每项任务都有独立的对话与结果。</p>
      </div>
      <p className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"><Mic className="size-4" />文字、语音，随时唤醒</p>
    </header>
    <section aria-label="我的工作助理" className="grid gap-5 lg:grid-cols-2">
      {catalog.isPending && [0, 1].map(id => <div key={id} role="status" aria-label="正在加载助理" className="h-56 animate-pulse rounded-lg bg-[var(--color-muted)]" />)}
      {catalog.data?.assistants.map(assistant => <article key={assistant.id} className="flex min-w-0 flex-col border-b py-6 lg:rounded-xl lg:border lg:p-7">
        <div className="flex items-center gap-4"><div className={assistant.id === 'weekly' ? 'text-[var(--color-primary)]' : 'text-emerald-600 dark:text-emerald-400'}><RobotPortrait kind={assistant.id} /></div>
          <div><h2 className="text-xl font-semibold">{assistant.name}</h2><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{assistant.id === 'weekly' ? '认真归纳，句句有据' : '环境清楚，账号有归处'}</p></div>
        </div>
        <p className="my-5 text-sm leading-6 text-[var(--color-muted-foreground)]">{assistant.description}</p>
        <button disabled={!assistant.enabled} onClick={() => launch(assistant.id)} className="mt-auto flex min-h-11 items-center justify-between rounded-md border px-4 text-sm font-medium hover:bg-[var(--color-accent)] disabled:opacity-50">
          {assistant.enabled ? '开始协作' : '需要管理员权限'}<ArrowUpRight className="size-4" />
        </button>
      </article>)}
    </section>
    {catalog.isError && <div role="alert" className="flex flex-wrap items-center gap-3 py-6 text-sm"><p>助理目录暂时无法加载，请核对登录与服务状态。</p><Button variant="outline" onClick={() => void catalog.refetch()}><RefreshCw className="mr-2 size-4" />重试</Button></div>}
    <section className="mt-10" aria-label="最近任务"><div className="mb-4 flex items-center gap-2"><History className="size-4" /><h2 className="text-sm font-semibold">最近协作</h2></div>
      {sessions.isPending && <div role="status" className="h-16 animate-pulse bg-[var(--color-muted)]" />}
      {sessions.isError && <Button variant="outline" onClick={() => void sessions.refetch()}>任务读取失败，重试</Button>}
      {sessions.data?.slice(0, 8).map(session => <button key={session.id} onClick={() => launch(session.assistantId, session.id)} className="flex min-h-16 w-full items-center gap-3 border-b py-3 text-left hover:bg-[var(--color-muted)]">
        <Bot className="size-4 shrink-0 text-[var(--color-muted-foreground)]" /><span className="min-w-0 flex-1 truncate text-sm">{session.title}</span><time className="text-xs text-[var(--color-muted-foreground)]">{new Date(session.createdAt).toLocaleDateString()}</time><ArrowUpRight className="size-4" />
      </button>)}
      {sessions.data?.length === 0 && <p className="py-6 text-sm text-[var(--color-muted-foreground)]">还没有协作记录。选一位助理，开始第一项任务。</p>}
    </section>
  </div>
}
