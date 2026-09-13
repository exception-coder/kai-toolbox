import type { OpenSpecChangeDetail } from '../types'
import type { TaskFilter } from '../viewModel'

export function ChangeProgress({ detail, onFilter }: { detail: OpenSpecChangeDetail; onFilter: (filter: TaskFilter) => void }) {
  const total = detail.totalTasks
  const completed = detail.completedTasks
  const remaining = Math.max(0, total - completed)
  return <section aria-label="变更进度" className="mb-6 border-y border-[var(--color-border)] py-4">
    <div className="flex flex-wrap gap-6 text-sm">
      <button type="button" onClick={() => onFilter('ALL')} className="underline-offset-4 hover:underline">全部任务 <strong className="ml-2 tabular-nums">{total}</strong></button>
      <button type="button" onClick={() => onFilter('DONE')} className="underline-offset-4 hover:underline">已完成什么 <strong className="ml-2 tabular-nums">{completed}</strong></button>
      <button type="button" onClick={() => onFilter('REMAINING')} className="underline-offset-4 hover:underline">还剩什么 <strong className="ml-2 tabular-nums">{remaining}</strong></button>
    </div>
    <progress aria-label="OpenSpec 任务完成进度" value={completed} max={Math.max(1, total)} className="mt-4 h-1.5 w-full accent-[var(--color-primary)]" />
    <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">{total === 0 ? '尚无任务，请先完善变更的任务清单。' : remaining > 0 ? `还有 ${remaining} 项未勾选完成，可点击“还剩什么”逐项查看。` : '任务已全部勾选完成，请结合验收证据确认交付结果。'}</p>
  </section>
}
