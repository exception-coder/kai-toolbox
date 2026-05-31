import { NewTaskForm } from '../components/NewTaskForm'
import { ProxyStatusBadge } from '../components/ProxyStatusBadge'
import { TaskList } from '../components/TaskList'

export function DownloaderPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">智能加速下载器</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              粘贴 URL 直接下载。自动探测系统代理，在直连与代理两条链路里挑速度更快的那条，HTTP Range 分段并发拉满带宽。
            </p>
          </div>
          <ProxyStatusBadge />
        </div>
      </header>

      <NewTaskForm />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--color-muted-foreground)]">任务</h2>
        <TaskList />
      </section>
    </div>
  )
}
