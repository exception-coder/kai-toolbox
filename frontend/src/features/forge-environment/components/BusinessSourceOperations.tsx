import { Download, RefreshCw, WandSparkles } from 'lucide-react'
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
  initializingOpenSpec,
  error,
  onRefresh,
  onSync,
  onInitializeOpenSpec,
}: {
  systems: BusinessSystemWorkspace[] | undefined
  checking: boolean
  busy: boolean
  syncing: boolean
  initializingOpenSpec: boolean
  error: boolean
  onRefresh: () => void
  onSync: () => void
  onInitializeOpenSpec: () => void
}) {
  const root = systems?.[0]?.workspacePath.replace(/[\\/]?[^\\/]+$/, '')
  const readyRepositories = systems?.flatMap((system) => system.members).filter((repository) => repository.cloned).length ?? 0
  const totalRepositories = systems?.flatMap((system) => system.members).length ?? 6
  const openSpecReadyRepositories = systems?.flatMap((system) => system.members)
    .filter((repository) => repository.openSpec?.status === 'READY').length ?? 0
  const clonedRepositories = systems?.flatMap((system) => system.members)
    .filter((repository) => repository.cloned).length ?? 0

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
            <span className="ml-auto text-right text-[11px] leading-4 text-[var(--color-muted-foreground)]">
              <span className="block">{system.message}</span>
              <span className="block">
                OpenSpec {system.members.filter((repository) => repository.openSpec?.status === 'READY').length}/{system.members.length}
              </span>
            </span>
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
      <Button className="mt-2 w-full" variant="outline" onClick={onInitializeOpenSpec}
        disabled={busy || checking || clonedRepositories === 0}>
        <WandSparkles /> {initializingOpenSpec ? '正在初始化 OpenSpec' : `初始化 OpenSpec · ${openSpecReadyRepositories}/${totalRepositories}`}
      </Button>
      <p className="mt-3 text-[11px] leading-5 text-[var(--color-muted-foreground)]">
        源码同步只做安全快进；OpenSpec 仅初始化干净仓库，并分别写入 Claude 与 Codex Skill。
      </p>
    </section>
  )
}
