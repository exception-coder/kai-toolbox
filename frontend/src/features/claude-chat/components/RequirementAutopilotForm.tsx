import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { startSessionAutopilot } from '../api'
import type { SessionAutopilotRun } from '../types'

/** 在原会话提交需求，复用持久监督；关闭覆盖层不撤销已创建的运行。 */
export function RequirementAutopilotForm({ sessionId, projectRoot, goal, onGoalChange, onStarted, onPendingChange }: {
  sessionId: string
  projectRoot: string
  goal: string
  onGoalChange: (goal: string) => void
  onStarted: (run: SessionAutopilotRun) => void
  onPendingChange: (pending: boolean) => void
}) {
  const [maxTurns, setMaxTurns] = useState(60)
  const [deadlineMinutes, setDeadlineMinutes] = useState(480)
  const start = useMutation({
    mutationFn: () => startSessionAutopilot(sessionId, {
      projectRoot, goal: goal.trim(), completionPolicy: 'REQUIREMENT_BEST_EFFORT',
      autoArchive: false, maxTurns, deadlineMinutes,
    }),
    onMutate: () => onPendingChange(true),
    onSuccess: onStarted,
    onSettled: () => onPendingChange(false),
  })
  const validBudget = Number.isInteger(maxTurns) && maxTurns >= 1 && maxTurns <= 200
    && Number.isInteger(deadlineMinutes) && deadlineMinutes >= 15 && deadlineMinutes <= 1440

  return <form className="mt-4 min-h-0 space-y-4 overflow-y-auto" onSubmit={event => {
    event.preventDefault()
    if (!start.isPending && goal.trim() && validBudget) start.mutate()
  }}>
    <label className="block space-y-2 text-sm"><span className="font-medium">需求与预期结果</span>
      <textarea value={goal} onChange={event => onGoalChange(event.target.value)} maxLength={2000} rows={5}
        disabled={start.isPending} placeholder="例如：优化移动端菜单，点击后立即切换并显示骨架，完成适用测试。"
        className="min-h-32 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" />
    </label>
    <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">自动梳理、实施、验证并持续处理未完成项。项目要求规格时会补齐；有可执行下一步就继续，真实阻塞时保留成果并说明原因。</p>
    <details className="border-y border-[var(--color-border)] py-2">
      <summary className="min-h-9 cursor-pointer text-sm leading-9">监督预算 · 最多 {maxTurns || '—'} 轮 / {deadlineMinutes || '—'} 分钟</summary>
      <div className="grid grid-cols-2 gap-4 py-2 text-sm">
        <label className="space-y-1"><span>最大轮次</span><input type="number" min={1} max={200} step={1} value={maxTurns || ''} disabled={start.isPending}
          onChange={event => setMaxTurns(Number(event.target.value))} className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2" /></label>
        <label className="space-y-1"><span>时限（分钟）</span><input type="number" min={15} max={1440} step={1} value={deadlineMinutes || ''} disabled={start.isPending}
          onChange={event => setDeadlineMinutes(Number(event.target.value))} className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2" /></label>
      </div>
    </details>
    <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">可随时暂停或停止；关闭窗口后继续监督。完成表示 Agent 已自验并提交证据，供你复核。连续无新增证据或预算耗尽会暂停；重启、发布等仍需明确授权。</p>
    {start.error && <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">{start.error instanceof Error ? start.error.message : '启动结果暂不可确认，请重试前核对当前会话监督状态。'}</p>}
    <div className="flex justify-end"><Button type="submit" disabled={!goal.trim() || !validBudget || start.isPending} className="min-h-11">
      {start.isPending ? '正在启动…' : '发送需求并持续推进'}
    </Button></div>
  </form>
}
