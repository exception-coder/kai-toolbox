import type { ReactNode } from 'react'
import { RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react'
import type { ConsultConversationPhase } from '../consultConversationState'

interface Props {
  phase: ConsultConversationPhase
  sessionReady: boolean
  runtimeFetching: boolean
  onRestoreQuestion: () => void
  onReconnect: () => void
  onRefetchRuntime: () => void
}

/** 紧凑展示当前回合状态，并在异常终态提供明确恢复路径。 */
export function ConsultConversationRuntimeStatus({
  phase,
  sessionReady,
  runtimeFetching,
  onRestoreQuestion,
  onReconnect,
  onRefetchRuntime,
}: Props) {
  if (phase === 'dispatching' || phase === 'running' || phase === 'checking') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="fc-thinking-dot">●</span>
        <span className="fc-thinking-dot" style={{ animationDelay: '0.2s' }}>●</span>
        <span className="fc-thinking-dot" style={{ animationDelay: '0.4s' }}>●</span>
        <span className="ml-1">{phase === 'dispatching'
          ? '正在准备调度…'
          : phase === 'checking'
            ? '正在核对本轮状态…'
            : 'AI 思考中…'}</span>
      </div>
    )
  }

  if (phase === 'stoppedWithoutResponse') {
    return (
      <RuntimeNotice
        title="本轮已停止，但未收到回答"
        explanation="底层任务已经结束。为避免重复执行，系统不会自动重发上一问。"
        actionLabel={sessionReady ? '恢复问题文本' : '重新连接会话'}
        actionIcon={sessionReady ? <RotateCcw className="size-3.5" /> : <RefreshCw className="size-3.5" />}
        onAction={sessionReady ? onRestoreQuestion : onReconnect}
      />
    )
  }

  if (phase === 'runtimeUnavailable') {
    return (
      <RuntimeNotice
        title="暂时无法确认本轮状态"
        explanation="发送入口已锁定，重新核对后即可继续。"
        actionLabel="重新检查"
        actionIcon={<RefreshCw className={`size-3.5 ${runtimeFetching ? 'animate-spin' : ''}`} />}
        onAction={onRefetchRuntime}
        disabled={runtimeFetching}
      />
    )
  }

  return null
}

function RuntimeNotice({
  title,
  explanation,
  actionLabel,
  actionIcon,
  onAction,
  disabled = false,
}: {
  title: string
  explanation: string
  actionLabel: string
  actionIcon: ReactNode
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-2 border-l-2 border-amber-300 pl-3 text-xs text-slate-600">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800">{title}</p>
        <p className="mt-1 leading-5 text-slate-500">{explanation}</p>
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-wait disabled:opacity-50"
        >
          {actionIcon}{actionLabel}
        </button>
      </div>
    </div>
  )
}
