import { ChevronDown, RefreshCw } from 'lucide-react'
import { useSessionStorage } from '../hooks/useSessionStorage'
import type { ClaudeChatSessionView } from '../types'
import { SessionStorageLabel } from './SessionStorageLabel'
import { storageDescription } from '../lib/sessionStorage'

/** 当前对象的可展开统计口径；仅刷新文件元信息，不影响草稿和执行状态。 */
export function CurrentSessionStorage({ session, compact = false }: { session?: ClaudeChatSessionView; compact?: boolean }) {
  const storage = useSessionStorage(session ? [session] : [])
  if (!session) return null
  const state = storage.values.get(session.id)
  return <div className={`flex min-w-0 items-start gap-2 text-xs text-[var(--color-muted-foreground)] ${compact ? 'border-y py-1' : 'px-3'}`}>
    <details key={session.id} className="group min-w-0 flex-1">
      <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] [&::-webkit-details-marker]:hidden">
        {compact && <span className="shrink-0 font-medium text-[var(--color-foreground)]">会话记录</span>}
        <SessionStorageLabel {...state} />
        {state?.value?.bytes != null && <span className="tabular-nums">· {state.value.fileCount} 个文件</span>}
        <ChevronDown aria-hidden="true" className="size-3 shrink-0 group-open:rotate-180" />
      </summary>
      <p className="mb-2 whitespace-pre-line break-words leading-relaxed">{storageDescription(state?.value, state?.failed)}</p>
    </details>
    <button type="button" onClick={storage.refresh} disabled={state?.loading} aria-label="刷新当前会话记录大小"
      className="flex min-h-9 shrink-0 items-center gap-1 rounded-sm px-1 hover:text-[var(--color-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50">
      <RefreshCw aria-hidden="true" className="size-3" />{!compact && '刷新'}
    </button>
  </div>
}
