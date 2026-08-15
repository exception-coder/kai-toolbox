import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { getSessionRuntimeState, type SessionUsage } from '../api'
import type { BackgroundTaskInfo, ChatItem, ConnState, SessionRuntimeState } from '../types'
import { abbr, parseUsage } from '../lib/metrics'
import { cn } from '@/lib/utils'

export type MobileSessionStatusModel = {
  kind: 'running' | 'background' | 'warning' | 'completed' | 'usage'
  label: string
  detail?: string
}

interface Props {
  sessionId: string
  items: ChatItem[]
  running: boolean
  engineLabel: string
  turnTokens: number
  connState: ConnState
  backgroundTasks: BackgroundTaskInfo[]
  usage: SessionUsage | null
  usageLoading: boolean
  onOpenUsage: () => void
  onOpenTrajectory: () => void
}

export function MobileSessionStatus({
  sessionId,
  items,
  running,
  engineLabel,
  turnTokens,
  connState,
  backgroundTasks,
  usage,
  usageLoading,
  onOpenUsage,
  onOpenTrajectory,
}: Props) {
  const [open, setOpen] = useState(false)
  const runtime = useQuery({
    queryKey: ['claude-chat-runtime-state', sessionId],
    queryFn: () => getSessionRuntimeState(sessionId),
    refetchInterval: running ? 5_000 : 15_000,
    retry: 1,
  })
  const status = deriveMobileSessionStatus({
    items,
    running,
    engineLabel,
    turnTokens,
    connState,
    backgroundTasks,
    runtimeState: runtime.data,
    runtimePending: runtime.isPending,
    runtimeError: runtime.isError,
    usage,
    usageLoading,
  })

  if (!status) return null

  const warning = status.kind === 'warning'
  const active = status.kind === 'running' || status.kind === 'background'
  const Icon = warning ? AlertTriangle : active ? Loader2 : status.kind === 'completed' ? CheckCircle2 : Activity

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-7 w-full min-w-0 items-center gap-1.5 border-b px-2 text-left text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]',
          warning
            ? 'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
            : 'border-[var(--color-border)]/70 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
        )}
        aria-label={`${status.label}，查看运行详情`}
        aria-live="polite"
      >
        <Icon className={cn('size-3.5 shrink-0', active && 'animate-spin', !warning && !active && 'text-[var(--color-primary)]')} />
        <span className="min-w-0 flex-1 truncate font-medium">{status.label}</span>
        <ChevronRight className="size-3.5 shrink-0 opacity-60" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="border-b px-4 pb-3 pt-4">
            <SheetTitle>本轮运行详情</SheetTitle>
            <SheetDescription className="mt-1">运行状态来自会话、Sidecar 与 Agent 的全链路事实；用量为整会话累计。</SheetDescription>
          </div>
          <div className="space-y-3 px-4 py-4 text-sm">
            <DetailRow label="当前状态" value={status.label} />
            {status.detail && <DetailRow label="说明" value={status.detail} />}
            {runtime.data && (
              <>
                <DetailRow label="全链路" value={`${runtimeStatusLabel(runtime.data.effectiveStatus)} · ${runtime.data.consistency}`} />
                <DetailRow label="建议" value={runtime.data.recommendedAction} />
              </>
            )}
            {usage && usage.turns > 0 && (
              <DetailRow label="会话累计" value={`${usage.turns} 轮 · ${abbr(usage.totalTokens)} Token`} />
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" onClick={() => { setOpen(false); onOpenTrajectory() }}>查看轨迹</Button>
              <Button onClick={() => { setOpen(false); onOpenUsage() }}>会话用量</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function deriveMobileSessionStatus({
  items,
  running,
  engineLabel,
  turnTokens,
  connState,
  backgroundTasks,
  runtimeState,
  runtimePending,
  runtimeError,
  usage,
  usageLoading,
}: {
  items: ChatItem[]
  running: boolean
  engineLabel: string
  turnTokens: number
  connState: ConnState
  backgroundTasks: BackgroundTaskInfo[]
  runtimeState?: SessionRuntimeState
  runtimePending: boolean
  runtimeError: boolean
  usage: SessionUsage | null
  usageLoading: boolean
}): MobileSessionStatusModel | null {
  if (running) {
    const reconnecting = connState === 'connecting' || connState === 'closed' || connState === 'error'
    return {
      kind: 'running',
      label: reconnecting
        ? '正在重连会话…'
        : `${engineLabel} 正在运行${turnTokens > 0 ? ` · ${abbr(turnTokens)} Token` : ''}`,
      detail: reconnecting ? 'Agent 可能仍在后台执行，连接恢复前不会误判为空闲。' : undefined,
    }
  }

  if (backgroundTasks.length > 0) {
    const first = backgroundTasks[0]
    return {
      kind: 'background',
      label: `后台任务进行中 · ${backgroundTasks.length}`,
      detail: first?.description || first?.taskType,
    }
  }

  if (runtimeError) {
    return {
      kind: 'warning',
      label: '全链路状态暂不可用',
      detail: '发送前仍会由后端再次核对会话状态。',
    }
  }

  if (runtimeState && runtimeState.consistency !== 'CONSISTENT') {
    return {
      kind: 'warning',
      label: `状态待校正 · ${runtimeStatusLabel(runtimeState.effectiveStatus)}`,
      detail: runtimeState.reason,
    }
  }

  if (runtimeState) {
    if (runtimeState.pendingDecision) {
      return {
        kind: 'warning',
        label: '等待你的确认',
        detail: runtimeState.reason,
      }
    }
    if ((runtimeState.backgroundTaskCount ?? 0) > 0) {
      return {
        kind: 'background',
        label: `后台任务进行中 · ${runtimeState.backgroundTaskCount}`,
        detail: runtimeState.reason,
      }
    }
    switch (runtimeState.effectiveStatus) {
      case 'RUNNING':
        return {
          kind: 'running',
          label: `${engineLabel} 正在运行${turnTokens > 0 ? ` · ${abbr(turnTokens)} Token` : ''}`,
          detail: runtimeState.phase || runtimeState.reason,
        }
      case 'AWAITING_DECISION':
        return {
          kind: 'warning',
          label: '等待你的确认',
          detail: runtimeState.reason,
        }
      case 'FINALIZING':
        return {
          kind: 'running',
          label: '正在收口本轮结果…',
          detail: runtimeState.reason,
        }
      case 'BACKGROUND_RUNNING':
        return {
          kind: 'background',
          label: `后台任务进行中${runtimeState.backgroundTaskCount ? ` · ${runtimeState.backgroundTaskCount}` : ''}`,
          detail: runtimeState.reason,
        }
      case 'RECONNECTING':
        return {
          kind: 'running',
          label: '正在重连会话…',
          detail: runtimeState.reason,
        }
      case 'INTERRUPTED':
        return {
          kind: 'warning',
          label: '本轮已中断',
          detail: runtimeState.reason,
        }
      case 'UNKNOWN':
        return {
          kind: 'warning',
          label: '会话状态待确认',
          detail: runtimeState.reason,
        }
      default:
        break
    }
  }

  // 只有全链路已明确回到 IDLE，才能把最近 result 当成当前唯一终态。
  // 首次查询期间宁可暂不显示，也不能闪现“已完成”后再跳回运行中。
  if (runtimePending || !runtimeState || runtimeState.effectiveStatus !== 'IDLE') return null

  const result = findLatestResult(items)
  if (result) {
    const reason = result.stopReason.trim().toLowerCase()
    const completed = ['end_turn', 'success', 'completed', 'stop'].includes(reason)
    const duration = result.latencyMs && result.latencyMs > 0 ? formatDuration(result.latencyMs) : null
    const outputTokens = parseUsage(result.usage)?.output
    const metrics = [duration, typeof outputTokens === 'number' && outputTokens > 0 ? `${abbr(outputTokens)} Token` : null]
      .filter(Boolean)
      .join(' · ')
    return completed
      ? { kind: 'completed', label: `已完成${metrics ? ` · ${metrics}` : ''}` }
      : {
          kind: 'warning',
          label: reason === 'interrupted' ? '本轮已中断' : '本轮异常结束',
          detail: '待发送队列不会自动继续。',
        }
  }

  if (usageLoading) return null
  if (usage && usage.turns > 0) {
    return {
      kind: 'usage',
      label: `会话累计 · ${usage.turns} 轮 · ${abbr(usage.totalTokens)} Token`,
    }
  }
  return null
}

function findLatestResult(items: ChatItem[]): Extract<ChatItem, { kind: 'result' }> | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'result') return item
    if (item.kind === 'user') return null
  }
  return null
}

function runtimeStatusLabel(status: SessionRuntimeState['effectiveStatus']): string {
  switch (status) {
    case 'RUNNING': return '运行中'
    case 'AWAITING_DECISION': return '等待确认'
    case 'FINALIZING': return '正在收口'
    case 'BACKGROUND_RUNNING': return '后台作业中'
    case 'RECONNECTING': return '正在重连'
    case 'INTERRUPTED': return '已中断'
    case 'IDLE': return '空闲'
    default: return '状态待确认'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  const seconds = Math.round(ms / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}m${rest}s` : `${minutes}m`
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-border)]/60 pb-2 last:border-0">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  )
}
