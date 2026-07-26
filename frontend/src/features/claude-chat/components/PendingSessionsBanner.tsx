import { HelpCircle, ShieldQuestion } from 'lucide-react'
import type { PendingSessionRef } from '../types'

/**
 * 跨会话待确认横幅：当「非当前会话」存在未决权限/提问请求时置顶提示，点击跳去该会话作答。
 * 目的——避免用户切到别的会话/模块后，某会话的 AskUserQuestion 无人应答直至超时被拒、任务中断。
 * 空（无其它会话待确认）时不渲染。
 */
export function PendingSessionsBanner({ sessions, currentSessionId, onGo, compact }: {
  sessions: PendingSessionRef[]
  currentSessionId: string | null
  onGo: (sessionId: string) => void
  compact?: boolean
}) {
  const others = sessions.filter(s => s.sessionId !== currentSessionId)
  if (others.length === 0) return null
  const first = others[0]
  const label = others.length === 1
    ? `会话「${first.cwd}」${first.kind === 'question' ? '有提问待回答' : '有操作待确认'}`
    : `${others.length} 个会话待你确认`

  return (
    <button
      type="button"
      onClick={() => onGo(first.sessionId)}
      title={others.map(s => `${s.cwd}：${s.kind === 'question' ? '提问待回答' : (s.toolName ? s.toolName + ' 待确认' : '操作待确认')}`).join('\n')}
      className={`flex w-full items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-3 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/50 ${compact ? 'py-1 text-[11px]' : 'py-1.5 text-xs'}`}
    >
      {first.kind === 'question'
        ? <HelpCircle className="size-3.5 shrink-0 animate-pulse" />
        : <ShieldQuestion className="size-3.5 shrink-0 animate-pulse" />}
      <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
      <span className="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
        去确认
      </span>
    </button>
  )
}
