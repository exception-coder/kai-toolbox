import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useSessionRuntimeState } from '../hooks/useSessionRuntimeState'
import { runtimeStatusLabel } from '../lib/sessionExecutionStatus'

interface Props {
  sessionId: string | null
  running: boolean
  runtimeRevision?: number
  onRecover: () => void
}

/** 展示独立全链路状态判定结果；正常时保持紧凑，异常时给出校正建议。 */
export function SessionRuntimeHealth({ sessionId, running, runtimeRevision = 0, onRecover }: Props) {
  const [recovering, setRecovering] = useState(false)
  const query = useSessionRuntimeState(sessionId, running, runtimeRevision)

  const recheck = () => { void query.refetch() }
  const recover = async () => {
    if (recovering) return
    setRecovering(true)
    try {
      // 后端会重新核对状态；页面查询结果不作为恢复授权。
      onRecover()
      await query.refetch()
    } finally {
      setRecovering(false)
    }
  }

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
        <button type="button" className="ml-auto shrink-0 underline underline-offset-2" onClick={recheck}
          disabled={query.isFetching}>重新检查</button>
      </div>
    )
  }

  const state = query.data
  const healthy = state.consistency === 'CONSISTENT' && state.effectiveStatus !== 'INTERRUPTED'
  return (
    <div
      className={healthy
        ? 'flex items-center gap-1.5 border-b border-[var(--color-border)]/60 px-3 py-1 text-[10px] text-[var(--color-muted-foreground)]'
        : 'flex items-center gap-1.5 border-b border-amber-200 bg-amber-50/80 px-3 py-1 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'}
      title={`${state.reason}；${state.recommendedAction}`}
    >
      {healthy ? <CheckCircle2 className="size-3 text-emerald-500" /> : <AlertTriangle className="size-3" />}
      <span className="font-medium">全链路 · {runtimeStatusLabel(state.effectiveStatus)}</span>
      {!healthy && <span className="min-w-0 truncate">· {state.reason}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {!healthy && <button type="button" className="underline underline-offset-2" onClick={recheck}
          disabled={query.isFetching}>重新检查</button>}
        {(state.effectiveStatus === 'INTERRUPTED' || state.consistency === 'RESTORABLE_SESSION_MISSING') && <button type="button"
          className="underline underline-offset-2 disabled:opacity-50" onClick={() => void recover()}
          disabled={recovering || running}>{recovering ? '正在恢复…' : '恢复会话'}</button>}
        {healthy && '状态一致'}
      </span>
    </div>
  )
}
