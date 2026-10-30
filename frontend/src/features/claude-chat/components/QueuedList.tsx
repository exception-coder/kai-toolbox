import { AlertTriangle, Clock, Send, X } from 'lucide-react'
import type { QueuedMessage } from '../hooks/useClaudeChatSocket'
import { cn } from '@/lib/utils'

/**
 * 待发送队列：回答执行中排队的消息，本轮结束后按序自动发出。
 * 桌面输入区与移动端详情抽屉共用，可逐条移除或一键清空。空队列不渲染。
 */
export function QueuedList({ items, pausedReason, canSendNow, onSendNow, onRemove, onClear, className }: {
  items: QueuedMessage[]
  pausedReason?: string | null
  canSendNow?: boolean
  onSendNow: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  className?: string
}) {
  if (items.length === 0) return null
  return (
    <div className={cn('border-b border-[var(--color-border)] px-3 py-2', className)}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        {pausedReason ? <AlertTriangle className="size-3 text-amber-600" /> : <Clock className="size-3" />}
        <span className={pausedReason ? 'text-amber-700 dark:text-amber-300' : undefined}>
          {pausedReason ?? `待发送 ${items.length} 条（本轮正常结束后按序自动发）`}
        </span>
        <button type="button" onClick={onClear} disabled={items.some(q => q.deliveryState && q.deliveryState !== 'FAILED')} className="ml-auto shrink-0 disabled:opacity-40 rounded px-1.5 py-0.5 hover:bg-[var(--color-accent)] max-md:min-h-10">
          全部清除
        </button>
      </div>
      <div className="flex max-h-32 flex-col gap-1 overflow-y-auto pr-1">
        {items.map((q, i) => (
          <div key={q.id} className="flex items-center gap-2 rounded-lg bg-[var(--color-background)] px-2.5 py-1.5 text-sm">
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <span className="block truncate" title={q.text}>{q.text || '（仅附件）'}</span>
              {q.deliveryState && <span className="block text-xs text-[var(--color-muted-foreground)]">{q.deliveryNote ?? (q.deliveryState === 'ACCEPTED' ? '已接收 · 执行中' : q.deliveryState === 'FAILED' ? '异常结束 · 请核对' : '正在核对派发回执')}</span>}
              {q.attachments && q.attachments.length > 0 && (
                <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">+{q.attachments.length} 附件</span>
              )}
            </div>
            {i === 0 && (canSendNow || ['BLOCKED', 'UNKNOWN', 'FAILED'].includes(q.deliveryState ?? '')) && !['ACCEPTED', 'DISPATCHING', 'CHECKING'].includes(q.deliveryState ?? '') && (
              <button
                type="button"
                onClick={() => onSendNow(q.id)}
                title={q.deliveryState ? '确认当前任务已处理完成，再继续队列' : '立即发送这条消息'}
                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--color-accent)] max-md:min-h-10"
              >
                <Send className="size-3" />{q.deliveryState ? '已核对，继续队列' : '发送'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(q.id)}
              disabled={!!q.deliveryState && q.deliveryState !== 'FAILED'}
              aria-label="移除"
              title="从待发送队列移除"
              className="shrink-0 disabled:opacity-40 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-destructive)] max-md:size-10 max-md:[&_svg]:mx-auto"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
