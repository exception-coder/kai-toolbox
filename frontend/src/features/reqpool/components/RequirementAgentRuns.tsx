import { Bot, CircleCheck, CircleDashed, CircleX, Clock3, Loader2 } from 'lucide-react'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import { requirementAgentRuns, type RequirementAgentRunStatus } from '../lib/requirementAgentRuns'

const STATUS_META: Record<RequirementAgentRunStatus, { label: string; tone: string }> = {
  IDLE: { label: '待执行', tone: 'text-slate-500' },
  RUNNING: { label: '执行中', tone: 'text-violet-600' },
  WAITING_USER: { label: '待确认', tone: 'text-amber-600' },
  SUCCEEDED: { label: '已完成', tone: 'text-emerald-600' },
  FAILED: { label: '执行失败', tone: 'text-rose-600' },
  STALE: { label: '需更新', tone: 'text-amber-600' },
}

/** 展示需求工程双 Agent 的可恢复后台运行状态。 */
export function RequirementAgentRuns({ session }: { session?: PrdSessionView }) {
  return (
    <section aria-label="Agent 运行状态" aria-live="polite" className="border-y border-[var(--color-border)] py-4">
      <div className="mb-3 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold"><Bot className="h-4 w-4 text-violet-600" />Agent 运行状态</div>
        <span className="pl-6 text-[11px] leading-4 text-[var(--color-muted-foreground)] sm:pl-0 sm:text-[10px]">异步任务可关闭页面继续执行</span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {requirementAgentRuns(session).map(run => {
          const meta = STATUS_META[run.status]
          const Icon = run.status === 'RUNNING' ? Loader2 : run.status === 'SUCCEEDED' ? CircleCheck : run.status === 'FAILED' ? CircleX : run.status === 'WAITING_USER' ? Clock3 : CircleDashed
          return (
            <div key={run.agentId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2.5">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.tone} ${run.active ? 'animate-spin' : ''}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span className="break-words text-xs font-medium">{run.name}</span>
                    <span className={`text-[11px] font-medium sm:shrink-0 ${meta.tone}`}>{meta.label}{run.engine ? ` · ${run.engine === 'codex' ? 'Codex' : 'Claude Code'}` : ''}</span>
                  </div>
                  <p className="mt-1 break-words text-[11px] leading-5 text-[var(--color-muted-foreground)]">{run.stage}</p>
                  {run.active && <div className="mt-2 h-1 overflow-hidden bg-[var(--color-muted)]"><div className="h-full bg-violet-500 transition-[width] motion-reduce:transition-none" style={{ width: `${run.progress}%` }} /></div>}
                  <p className={`mt-1.5 break-words text-[11px] leading-5 ${run.error ? 'text-rose-600' : 'text-[var(--color-muted-foreground)]'}`}>{run.error || `下一步：${run.nextAction}`}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
