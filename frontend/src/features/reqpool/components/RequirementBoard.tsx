import type { ReactNode, RefObject } from 'react'
import { Activity, ArrowRight, CircleCheck, CircleDot, Loader2, Sparkles } from 'lucide-react'
import type { DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import type { ReqItemView } from '../types'
import {
  decisionOf,
  effectiveInsight,
  relativeTime,
  type ReqpoolDensity,
} from '../lib/reqpoolPageModel'
import { requirementAgentRuns } from '../lib/requirementAgentRuns'
import { REQUIREMENT_LIFECYCLES, REQUIREMENT_LIFECYCLE_META, requirementLifecycle } from '../lib/requirementLifecycle'

const MISSION_CONTROL_LIMIT = 5

function focusScore(item: ReqItemView): number {
  const running = item.insightRun?.status === 'RUNNING' ? 100 : 0
  const stage = item.status === 'IN_DEV' ? 80 : item.status === 'CLARIFYING' ? 65 : item.status === 'PRD_READY' ? 50 : 0
  const decision = decisionOf(item) === 'NOW' ? 35 : decisionOf(item) === 'CLARIFY' ? 25 : 0
  const risk = item.priority === 'HIGH' || item.aiInsightStale ? 20 : 0
  return running + stage + decision + risk
}

export function selectMissionFocus(items: ReqItemView[]): ReqItemView | null {
  return [...items].sort((left, right) => focusScore(right) - focusScore(left) || right.updatedAt - left.updatedAt)[0] ?? null
}

function activityNarrative(item: ReqItemView): { current: string; next: string } {
  if (item.insightRun?.status === 'RUNNING') {
    const current = item.insightRun.stage === 'DISCOVERING'
      ? '正在查询业务知识、Graphify 与项目路由'
      : item.insightRun.stage === 'QUEUED' ? '已进入 AI 分析队列' : '正在生成并校验需求判定'
    return { current, next: '分析完成后更新优先级与规划证据' }
  }
  if (item.aiInsightStale) return { current: '需求事实已变化，历史 AI 判定需要刷新', next: '重新分析需求并确认最新证据' }
  if (!item.assignee) return { current: '需求已进入流程，等待明确唯一负责人', next: '指派负责人并确认承诺时间' }
  if (item.status === 'DRAFT') return { current: '正在等待需求事实与验收口径补齐', next: '完成澄清后进入规格生成' }
  if (item.status === 'CLARIFYING') return { current: 'AI 正在收敛业务规则与边界', next: '回答待确认问题并生成规格' }
  if (item.status === 'PRD_READY') return { current: '规格已就绪，等待形成可执行计划', next: '生成执行方案并确认开发入口' }
  if (item.status === 'IN_DEV') return { current: '需求正在交付，持续核对代码与计划证据', next: '完成代码验证并收敛交付结论' }
  if (item.status === 'DONE') return { current: '交付证据已收敛', next: '复核结果或进入归档' }
  return { current: '任务已退出当前执行流', next: '需要时打开详情查看历史证据' }
}

export function RequirementBoard({
  items,
  density,
  allSelected,
  selectAllRef,
  onToggleAll,
  renderNote,
  renderLineage,
  getRequirement,
  getSession,
}: {
  items: ReqItemView[]
  density: ReqpoolDensity
  allSelected: boolean
  selectAllRef: RefObject<HTMLInputElement | null>
  onToggleAll: () => void
  renderNote: (item: ReqItemView) => ReactNode
  renderLineage: (item: ReqItemView) => ReactNode
  getRequirement?: (item: ReqItemView) => DeliveryRequirement | undefined
  getSession?: (item: ReqItemView) => PrdSessionView | undefined
}) {
  const lifecycleOf = (item: ReqItemView) => requirementLifecycle(item, getRequirement?.(item), getSession?.(item))
  const grouped = new Map(REQUIREMENT_LIFECYCLES.map(stage => [stage, [] as ReqItemView[]]))
  for (const item of items) grouped.get(lifecycleOf(item))?.push(item)
  const focus = selectMissionFocus(items)

  if (items.length <= MISSION_CONTROL_LIMIT && focus) {
    const recent = items.filter(item => item.id !== focus.id).sort((a, b) => b.updatedAt - a.updatedAt)
    const narrative = activityNarrative(focus)
    const insight = effectiveInsight(focus)
    const lifecycle = lifecycleOf(focus)
    const agentRuns = requirementAgentRuns(getSession?.(focus))
    const activeRun = agentRuns.find(run => run.active)
    const completedRuns = agentRuns.filter(run => run.status === 'SUCCEEDED')
    return (
      <section aria-label="AI 任务指挥台">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 text-[10px] text-[var(--color-muted-foreground)]">
          <label className="flex cursor-pointer items-center gap-2"><input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={onToggleAll} className="h-3.5 w-3.5 accent-violet-600" />选择当前结果</label>
          <span>少量任务模式 · 聚焦最需要推进的一项</span>
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="border-b border-[var(--color-border)] p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">Current focus</p><h2 className="mt-1 text-base font-semibold">当前焦点</h2></div><span className="text-[10px] text-[var(--color-muted-foreground)]">{REQUIREMENT_LIFECYCLE_META[lifecycle].label} · {relativeTime(focus.updatedAt)}更新</span></div>
            {renderNote(focus)}
            {renderLineage(focus)}
          </div>
          <aside className="p-4 sm:p-6" aria-label="AI 当前活动">
            <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-violet-600" /><h2 className="text-sm font-semibold">AI 执行动态</h2>{activeRun && <span className="ml-auto text-[9px] font-medium uppercase tracking-wider text-violet-600">Live</span>}</div>
            <p className="mt-4 flex items-start gap-2 text-sm leading-6">{activeRun && <Loader2 className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin text-violet-600 motion-reduce:animate-none" />}{activeRun?.stage || narrative.current}</p>
            {activeRun?.engine && <p className="mt-1 pl-5 text-[10px] text-[var(--color-muted-foreground)]">{activeRun.engine === 'codex' ? 'Codex' : 'Claude Code'} · 后台执行中</p>}
            {insight?.recommendation && <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">{insight.recommendation}</p>}
            <div className="mt-6 border-l border-[var(--color-border)] pl-4"><p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Next action</p><p className="mt-2 flex items-start gap-2 text-xs leading-5"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />{narrative.next}</p></div>
            <div className="mt-6 space-y-3 border-t border-[var(--color-border)] pt-4 text-[10px] text-[var(--color-muted-foreground)]">
              <div className="flex items-center gap-2"><CircleDot className="h-3 w-3" />需求已登记 · 当前{REQUIREMENT_LIFECYCLE_META[lifecycle].label}</div>
              {completedRuns.map(run => <div key={run.agentId} className="flex items-center gap-2"><CircleCheck className="h-3 w-3 text-emerald-500" />{run.stage}</div>)}
              <div className="flex items-center gap-2"><span className="relative flex h-3 w-3 items-center justify-center"><span className="motion-safe:animate-ping absolute h-2 w-2 rounded-full bg-violet-400 opacity-40" /><span className="relative h-1.5 w-1.5 rounded-full bg-violet-600" /></span>{activeRun?.stage || narrative.current}</div>
            </div>
          </aside>
        </div>
        <div className="border-t border-[var(--color-border)] px-4 py-4 sm:px-6">
          <div className="flex min-w-max items-center gap-5 overflow-x-auto pb-1" aria-label="生命周期阶段">
            {REQUIREMENT_LIFECYCLES.map(stage => <div key={stage} className="flex items-center gap-2 text-[10px]"><span className={`h-1.5 w-1.5 rounded-full ${REQUIREMENT_LIFECYCLE_META[stage].accent}`} /><span className={stage === lifecycle ? 'font-semibold text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]'}>{REQUIREMENT_LIFECYCLE_META[stage].label}</span><span className="tabular-nums text-[var(--color-muted-foreground)]">{grouped.get(stage)?.length ?? 0}</span></div>)}
          </div>
        </div>
        {recent.length > 0 && <div className="border-t border-[var(--color-border)] px-4 py-5 sm:px-6"><div className="mb-3 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" /><h2 className="text-xs font-semibold">最近任务</h2></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{recent.map(item => <div key={item.id}>{renderNote(item)}{renderLineage(item)}</div>)}</div></div>}
      </section>
    )
  }

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
          {REQUIREMENT_LIFECYCLES.map(stage => {
            const stageItems = grouped.get(stage) ?? []
            return (
              <section key={stage} aria-labelledby={`req-stage-${stage}`} className="min-w-0 border-t border-[var(--color-border)] bg-[var(--color-background)]/55">
                <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-3 py-3 backdrop-blur-sm">
                  <span className={`h-1.5 w-1.5 rounded-full ${REQUIREMENT_LIFECYCLE_META[stage].accent}`} />
                  <h2 id={`req-stage-${stage}`} className="text-[11px] font-semibold tracking-wide">{REQUIREMENT_LIFECYCLE_META[stage].label}</h2>
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
