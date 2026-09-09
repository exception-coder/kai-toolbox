import type { ReactNode, RefObject } from 'react'
import type { ReqItemView } from '../types'
import {
  groupRequirementsByStatus,
  REQUIREMENT_BOARD_STAGES,
  STATUS_META,
  type ReqpoolDensity,
} from '../lib/reqpoolPageModel'

const STAGE_ACCENT = {
  DRAFT: 'bg-slate-400',
  CLARIFYING: 'bg-amber-500',
  PRD_READY: 'bg-sky-500',
  IN_DEV: 'bg-violet-500',
  DONE: 'bg-emerald-500',
  CANCELLED: 'bg-rose-400',
} as const

export function RequirementBoard({
  items,
  density,
  allSelected,
  selectAllRef,
  onToggleAll,
  renderNote,
  renderLineage,
}: {
  items: ReqItemView[]
  density: ReqpoolDensity
  allSelected: boolean
  selectAllRef: RefObject<HTMLInputElement | null>
  onToggleAll: () => void
  renderNote: (item: ReqItemView) => ReactNode
  renderLineage: (item: ReqItemView) => ReactNode
}) {
  const grouped = groupRequirementsByStatus(items)

  return (
    <section aria-label="需求生命周期看板">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] text-[var(--color-muted-foreground)]">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            disabled={items.length === 0}
            className="h-3.5 w-3.5 rounded border-[var(--color-border)] accent-violet-600"
          />
          选择当前筛选结果
        </label>
        <span className="hidden sm:inline">按阶段从左到右推进 · 点击便签查看完整证据</span>
      </div>
      <div className="overflow-x-auto bg-[var(--color-muted)]/20 p-3 [scrollbar-width:thin]">
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(286px,1fr)] gap-3 xl:min-w-[1420px] xl:grid-flow-row xl:grid-cols-6">
          {REQUIREMENT_BOARD_STAGES.map(stage => {
            const stageItems = grouped.get(stage) ?? []
            return (
              <section key={stage} aria-labelledby={`req-stage-${stage}`} className="min-w-0 border-t border-[var(--color-border)] bg-[var(--color-background)]/55">
                <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-3 py-3 backdrop-blur-sm">
                  <span className={`h-1.5 w-1.5 rounded-full ${STAGE_ACCENT[stage]}`} />
                  <h2 id={`req-stage-${stage}`} className="text-[11px] font-semibold tracking-wide">{STATUS_META[stage].label}</h2>
                  <span className="ml-auto min-w-5 text-right text-[10px] tabular-nums text-[var(--color-muted-foreground)]">{stageItems.length}</span>
                </header>
                <div className={density === 'compact' ? 'space-y-2 p-2' : 'space-y-3 p-2.5'}>
                  {stageItems.map(item => (
                    <div key={item.id}>
                      {renderNote(item)}
                      {renderLineage(item)}
                    </div>
                  ))}
                  {stageItems.length === 0 && (
                    <div className="border border-dashed border-[var(--color-border)] px-3 py-8 text-center text-[10px] leading-5 text-[var(--color-muted-foreground)]">
                      当前阶段暂无需求
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </section>
  )
}
