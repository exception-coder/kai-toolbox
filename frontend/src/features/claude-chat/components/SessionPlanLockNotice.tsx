import { LockKeyhole, Unlock } from 'lucide-react'
import type { ClaudeChatSessionView } from '../types'
import { useSessionPlanState } from '../hooks/useSessionPlanState'

/** 过期规划的共享只读提示和显式解锁入口。 */
export function SessionPlanLockNotice({ session, compact = false }: {
  session?: ClaudeChatSessionView
  compact?: boolean
}) {
  const { busyId, unlock } = useSessionPlanState()
  if (!session?.planExpired) return null

  return (
    <div className={`flex items-center gap-2 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 ${compact ? 'border-t px-2 py-1.5 text-[11px]' : 'rounded-lg border px-3 py-2 text-xs'}`}>
      <LockKeyhole className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">规划已过期，当前会话只读</span>
      <button
        type="button"
        disabled={busyId === session.id}
        onClick={() => void unlock(session)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/70 px-2 py-1 font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:hover:bg-amber-900/60"
      >
        <Unlock className="size-3" />
        {busyId === session.id ? '解锁中…' : '解锁规划'}
      </button>
    </div>
  )
}
