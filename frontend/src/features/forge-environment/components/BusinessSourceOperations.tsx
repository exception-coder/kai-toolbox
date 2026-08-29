import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BusinessSystemWorkspace } from '../types'

function statusColor(system: BusinessSystemWorkspace) {
  if (system.ready) return 'bg-emerald-500'
  return system.status === 'BLOCKED' ? 'bg-red-500' : 'bg-amber-500'
}

export function BusinessSourceOperations({
  systems,
  checking,
  busy,
  syncing,
  error,
  onRefresh,
  onSync,
}: {
  systems: BusinessSystemWorkspace[] | undefined
  checking: boolean
  busy: boolean
  syncing: boolean
  error: boolean
  onRefresh: () => void
  onSync: () => void
}) {
  const root = systems?.[0]?.workspacePath.replace(/[\\/]?[^\\/]+$/, '')
  const readyRepositories = systems?.flatMap((system) => system.members).filter((repository) => repository.cloned).length ?? 0
  const totalRepositories = systems?.flatMap((system) => system.members).length ?? 6

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">Business Source</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">业务系统源码</h2>
        <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">{readyRepositories}/{totalRepositories}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
        4 个系统、6 个固定仓库。默认保存在 <code className="break-all font-mono text-[11px]">{root ?? '~/.kai-toolbox/sources'}</code>。
      </p>

      <div className="mt-4 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {(systems ?? []).map((system) => (
          <div key={system.id} className="flex items-center gap-2 py-2 text-xs">
            <span className={`size-2 shrink-0 rounded-full ${statusColor(system)}`} />
            <span className="font-medium">{system.name}</span>
            <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">{system.message}</span>
          </div>
        ))}
        {!systems && !error && <p className="py-3 text-xs text-[var(--color-muted-foreground)]">正在读取源码状态…</p>}
        {error && (
          <p className="py-3 text-xs leading-5 text-[var(--color-destructive)]">
            暂时无法读取源码状态。确认 Forge 后端可用后点击“检查状态”重试。
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onRefresh} disabled={busy || checking}>
          <RefreshCw className={checking ? 'animate-spin' : undefined} /> 检查状态
        </Button>
        <Button onClick={onSync} disabled={busy || checking}>
          <Download /> {syncing ? '正在拉取' : '一键拉取'}
        </Button>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[var(--color-muted-foreground)]">
        已存在仓库只做安全快进；未提交修改、分叉或远端不匹配时会跳过，不覆盖本地现场。
      </p>
    </section>
  )
}
