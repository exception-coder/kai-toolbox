import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { getSessionRuntimeState } from '../api'

interface Props {
  sessionId: string | null
  running: boolean
}

/** 展示独立全链路状态判定结果；正常时保持紧凑，异常时给出校正建议。 */
export function SessionRuntimeHealth({ sessionId, running }: Props) {
  const query = useQuery({
    queryKey: ['claude-chat-runtime-state', sessionId],
    queryFn: () => getSessionRuntimeState(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: running ? 5_000 : 15_000,
    retry: 1,
  })

  if (!sessionId) return null
  if (query.isPending) {
    return (
      <div className="flex items-center gap-1.5 border-b border-[var(--color-border)]/60 px-3 py-1 text-[10px] text-[var(--color-muted-foreground)]">
        <Loader2 className="size-3 animate-spin" />正在核对全链路状态…
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50/80 px-3 py-1 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="size-3" />全链路状态暂不可用，发送前会由后端再次核对
      </div>
    )
  }

  const state = query.data
  const healthy = state.consistency === 'CONSISTENT'
  return (
    <div
      className={healthy
        ? 'flex items-center gap-1.5 border-b border-[var(--color-border)]/60 px-3 py-1 text-[10px] text-[var(--color-muted-foreground)]'
        : 'flex items-center gap-1.5 border-b border-amber-200 bg-amber-50/80 px-3 py-1 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'}
      title={`${state.reason}；${state.recommendedAction}`}
    >
      {healthy ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertTriangle className="size-3" />}
      <span className="font-medium">全链路 · {statusLabel(state.effectiveStatus)}</span>
      {!healthy && <span className="min-w-0 truncate">· {state.reason}</span>}
      <span className="ml-auto shrink-0">{healthy ? '状态一致' : state.consistency}</span>
    </div>
  )
}

function statusLabel(status: string): string {
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
