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
    <section aria-label="Agent 运行状态" className="border-y border-[var(--color-border)] py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold"><Bot className="h-4 w-4 text-violet-600" />Agent 运行状态</div>
        <span className="text-[9px] text-[var(--color-muted-foreground)]">异步任务可关闭页面继续执行</span>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">{run.name}</span>
                    <span className={`text-[9px] font-medium ${meta.tone}`}>{meta.label}{run.engine ? ` · ${run.engine === 'codex' ? 'Codex' : 'Claude Code'}` : ''}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{run.stage}</p>
                  {run.active && <div className="mt-2 h-1 overflow-hidden bg-[var(--color-muted)]"><div className="h-full bg-violet-500 transition-[width]" style={{ width: `${run.progress}%` }} /></div>}
                  <p className={`mt-1.5 text-[9px] leading-4 ${run.error ? 'text-rose-600' : 'text-[var(--color-muted-foreground)]'}`}>{run.error || `下一步：${run.nextAction}`}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
