import { AlertTriangle, Clock, Send, X } from 'lucide-react'
import type { QueuedMessage } from '../hooks/useClaudeChatSocket'

/**
 * 待发送队列：回答执行中排队的消息，本轮结束后按序自动发出。
 * 显示在输入区上方，可逐条移除或一键清空。空队列不渲染。
 */
export function QueuedList({ items, pausedReason, canSendNow, onSendNow, onRemove, onClear }: {
  items: QueuedMessage[]
  pausedReason?: string | null
  canSendNow?: boolean
  onSendNow: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
}) {
  if (items.length === 0) return null
  return (
    <div className="border-b border-[var(--color-border)] px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        {pausedReason ? <AlertTriangle className="size-3 text-amber-600" /> : <Clock className="size-3" />}
        <span className={pausedReason ? 'text-amber-700 dark:text-amber-300' : undefined}>
          {pausedReason ?? `待发送 ${items.length} 条（本轮正常结束后按序自动发）`}
        </span>
        <button type="button" onClick={onClear} className="ml-auto rounded px-1.5 py-0.5 hover:bg-[var(--color-accent)]">
          全部清除
        </button>
      </div>
      <div className="flex max-h-32 flex-col gap-1 overflow-y-auto pr-1">
        {items.map((q, i) => (
          <div key={q.id} className="flex items-center gap-2 rounded-lg bg-[var(--color-background)] px-2.5 py-1.5 text-sm">
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate" title={q.text}>
              {q.text || '（仅附件）'}
              {q.attachments && q.attachments.length > 0 && (
                <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">+{q.attachments.length} 附件</span>
              )}
            </span>
            {i === 0 && canSendNow && (
              <button
                type="button"
                onClick={() => onSendNow(q.id)}
                title="立即发送这条消息"
                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--color-accent)]"
              >
                <Send className="size-3" />发送
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(q.id)}
              aria-label="移除"
              title="从待发送队列移除"
              className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-destructive)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
