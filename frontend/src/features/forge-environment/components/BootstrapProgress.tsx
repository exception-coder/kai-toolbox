import { Circle, CircleCheck, CircleDashed, CircleX, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BootstrapStep, RestartRequiredEvent } from '../types'

const STEP_ICON = {
  PENDING: Circle,
  RUNNING: CircleDashed,
  SKIPPED: CircleCheck,
  SUCCEEDED: CircleCheck,
  FAILED: CircleX,
}

export function BootstrapProgress({
  steps,
  logs,
  running,
  error,
  restartRequired,
  onRetry,
  title = '初始化进度',
  emptyTitle = '尚未开始初始化',
  emptyDescription = '点击“一键初始化”后，这里会按依赖顺序显示每一步。已就绪的项目会自动跳过。',
  errorTitle = '初始化未完成',
}: {
  steps: BootstrapStep[]
  logs: string[]
  running: boolean
  error: string | null
  restartRequired: RestartRequiredEvent | null
  onRetry: () => void
  title?: string
  emptyTitle?: string
  emptyDescription?: string
  errorTitle?: string
}) {
  return (
    <aside className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {running && <span className="text-xs text-[var(--color-info)]">执行中</span>}
      </div>

      {steps.length === 0 && !error && !restartRequired ? (
        <div className="py-8">
          <p className="text-sm font-medium">{emptyTitle}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">{emptyDescription}</p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {steps.map((step) => {
            const Icon = STEP_ICON[step.state]
            return (
              <li key={step.id} className="flex gap-3">
                <Icon className={`mt-0.5 size-4 shrink-0 ${step.state === 'FAILED' ? 'text-[var(--color-danger)]' : step.state === 'RUNNING' ? 'animate-spin text-[var(--color-info)]' : 'text-[var(--color-muted-foreground)]'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--color-muted-foreground)]">{step.message}</p>
                  {step.detail && <p className="mt-1 break-words font-mono text-[11px] leading-5 text-[var(--color-muted-foreground)]">{step.detail}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {restartRequired && (
        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium">需要重启 Forge 后继续</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">{restartRequired.message}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={onRetry} disabled={running}>
            <RotateCw /> 重启后重新检测
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium text-[var(--color-danger)]">{errorTitle}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">{error}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={onRetry} disabled={running}>
            <RotateCw /> 重新检测
          </Button>
        </div>
      )}

      {logs.length > 0 && (
        <details className="mt-5 border-t border-[var(--color-border)] pt-4">
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-muted-foreground)]">查看命令输出</summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-muted)] p-3 text-[11px] leading-5">{logs.join('\n')}</pre>
        </details>
      )}
    </aside>
  )
}
